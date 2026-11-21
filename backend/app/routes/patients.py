import os
import uuid
from datetime import date, timedelta

from flask import Blueprint, Response, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload, selectinload

from app import storage
from app.credit import balances
from app.models import CreditPayment, Patient, PatientInvestigation, Sale, db
from app.timeutil import local_today
from app.utils import admin_required, to_number

patients_bp = Blueprint("patients", __name__)


def _clean(value):
    value = (value or "").strip() if isinstance(value, str) else value
    return value or None


def _apply_fields(patient, data):
    """Copy editable fields from request data onto the patient. Returns error or None."""
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return "Patient name is required"
        patient.name = name
    if "gender" in data:
        patient.gender = _clean(data["gender"])
    if "phone" in data:
        patient.phone = _clean(data["phone"])
    if "address" in data:
        patient.address = _clean(data["address"])
    if "allergies" in data:
        patient.allergies = _clean(data["allergies"])
    if "medical_notes" in data:
        patient.medical_notes = _clean(data["medical_notes"])
    if "nrc_number" in data:
        patient.nrc_number = _clean(data["nrc_number"])
    if "credit_limit" in data:
        limit, err = to_number(data.get("credit_limit"), "Credit limit", allow_none=True)
        if err:
            return err
        patient.credit_limit = limit
    if "date_of_birth" in data:
        raw = _clean(data["date_of_birth"])
        if raw is None:
            patient.date_of_birth = None
        else:
            try:
                dob = date.fromisoformat(raw)
            except ValueError:
                return "Invalid date_of_birth format (YYYY-MM-DD)"
            if dob > local_today():
                return "Date of birth cannot be in the future"
            patient.date_of_birth = dob
    return None


def _patient_with_stats(patient):
    d = patient.to_dict()
    visits = patient.visits
    d["visit_count"] = len(visits)
    d["last_visit"] = visits[0].to_dict()["created_at"] if visits else None
    d["balance"] = balances([patient.id]).get(patient.id, {}).get("balance", 0.0)
    return d


@patients_bp.route("", methods=["GET"])
@jwt_required()
def list_patients():
    search = request.args.get("search", "").strip()
    limit = min(request.args.get("limit", 100, type=int), 500)

    query = Patient.query
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Patient.name.ilike(like),
                Patient.phone.ilike(like),
                Patient.patient_number.ilike(like),
                Patient.nrc_number.ilike(like),
            )
        )
    patients = query.order_by(Patient.name).limit(limit).all()

    # Visit counts for all listed patients in ONE query (not one query per patient)
    stats = {}
    ids = [p.id for p in patients]
    if ids:
        rows = (
            db.session.query(Sale.patient_id, func.count(Sale.id), func.max(Sale.created_at))
            .filter(Sale.patient_id.in_(ids), Sale.status != "voided")
            .group_by(Sale.patient_id)
            .all()
        )
        stats = {pid: (count, last) for pid, count, last in rows}
    owed = balances(ids) if ids else {}

    result = []
    for p in patients:
        count, last = stats.get(p.id, (0, None))
        d = p.to_dict()
        d["visit_count"] = count
        d["last_visit"] = (last.isoformat() + "Z") if last else None
        d["balance"] = owed.get(p.id, {}).get("balance", 0.0)
        result.append(d)
    return jsonify(result)


@patients_bp.route("", methods=["POST"])
@jwt_required()
def create_patient():
    data = request.get_json() or {}
    patient = Patient(name="")
    err = _apply_fields(patient, data)
    if err:
        return jsonify({"error": err}), 400
    if not patient.name:
        return jsonify({"error": "Patient name is required"}), 400

    db.session.add(patient)
    db.session.flush()  # get the id
    patient.patient_number = f"P{patient.id:05d}"
    db.session.commit()
    return jsonify(_patient_with_stats(patient)), 201


@patients_bp.route("/<int:patient_id>", methods=["GET"])
@jwt_required()
def get_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    visits = (  # newest first, with items/cashier loaded together
        Sale.query.options(
            selectinload(Sale.items),
            joinedload(Sale.cashier),
            joinedload(Sale.patient),
        )
        .filter(Sale.patient_id == patient.id)
        .order_by(Sale.created_at.desc())
        .all()
    )
    result = patient.to_dict()
    counted = [v for v in visits if v.status != "voided"]
    result["visit_count"] = len(counted)
    result["last_visit"] = counted[0].to_dict()["created_at"] if counted else None
    result["visits"] = [v.to_dict() for v in visits]
    result["total_doctor_fees"] = sum(float(v.doctor_fee or 0) for v in counted)
    result["total_spent"] = sum(float(v.total_amount) for v in counted)
    result.update(balances([patient.id]).get(patient.id, {"credit": 0.0, "paid": 0.0, "balance": 0.0}))
    return jsonify(result)


@patients_bp.route("/<int:patient_id>", methods=["PUT"])
@jwt_required()
def update_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    err = _apply_fields(patient, request.get_json() or {})
    if err:
        return jsonify({"error": err}), 400
    db.session.commit()
    return jsonify(_patient_with_stats(patient))


@patients_bp.route("/<int:patient_id>", methods=["DELETE"])
@jwt_required()
@admin_required()
def delete_patient(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    if Sale.query.filter_by(patient_id=patient_id).first():
        return jsonify(
            {"error": "Cannot delete a patient who has visit history."}
        ), 409
    if CreditPayment.query.filter_by(patient_id=patient_id).first():
        return jsonify({"error": "Cannot delete a customer who has credit payments."}), 409
    if PatientInvestigation.query.filter_by(patient_id=patient_id).first():
        return jsonify(
            {"error": "Delete this patient's investigation files first."}
        ), 409
    db.session.delete(patient)
    db.session.commit()
    return jsonify({"message": "Patient deleted"})


# ---------------------------------------------------------------------------
# Investigations (blood reports, X-rays, scans...) stored as image/PDF files
# ---------------------------------------------------------------------------

# Detected from the file's first bytes, not from the name or browser-sent type
_FILE_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"%PDF-", "application/pdf", ".pdf"),
)


def _detect_file_type(data):
    for signature, content_type, ext in _FILE_SIGNATURES:
        if data.startswith(signature):
            return content_type, ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None, None


def _apply_investigation_fields(inv, data, patient_id):
    """Copy title/test_date/notes/sale_id from request data. Returns error or None."""
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return "Test name is required"
        inv.title = title[:200]
    if "notes" in data:
        inv.notes = _clean(data.get("notes"))
    if "test_date" in data:
        raw = _clean(data.get("test_date"))
        if raw is None:
            inv.test_date = None
        else:
            try:
                test_date = date.fromisoformat(raw)
            except ValueError:
                return "Invalid test date format (YYYY-MM-DD)"
            # +1 day of slack for a clock that is slightly off
            if test_date > local_today() + timedelta(days=1):
                return "Test date cannot be in the future"
            inv.test_date = test_date
    if "sale_id" in data:
        raw = _clean(data.get("sale_id"))
        if raw is None:
            inv.sale_id = None
        else:
            try:
                sale_id = int(raw)
            except (TypeError, ValueError):
                return "Invalid visit"
            sale = db.session.get(Sale, sale_id)
            if not sale or sale.patient_id != patient_id:
                return "That visit does not belong to this patient"
            inv.sale_id = sale_id
    return None


def _get_investigation(patient_id, inv_id):
    return PatientInvestigation.query.filter_by(
        id=inv_id, patient_id=patient_id
    ).first_or_404()


def _can_modify(inv):
    return get_jwt().get("role") == "admin" or str(inv.uploaded_by) == get_jwt_identity()


@patients_bp.route("/<int:patient_id>/investigations", methods=["GET"])
@jwt_required()
def list_investigations(patient_id):
    Patient.query.get_or_404(patient_id)
    rows = (
        PatientInvestigation.query.filter_by(patient_id=patient_id)
        .order_by(
            PatientInvestigation.test_date.desc().nullslast(),
            PatientInvestigation.created_at.desc(),
        )
        .all()
    )
    return jsonify([r.to_dict() for r in rows])


@patients_bp.route("/<int:patient_id>/investigations", methods=["POST"])
@jwt_required()
def upload_investigation(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    if not storage.is_configured():
        return jsonify({"error": "File storage is not configured on the server"}), 503

    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify({"error": "Choose an image or PDF to upload"}), 400

    max_mb = current_app.config["MAX_UPLOAD_MB"]
    data = upload.read(max_mb * 1024 * 1024 + 1)
    if not data:
        return jsonify({"error": "The file is empty"}), 400
    if len(data) > max_mb * 1024 * 1024:
        return jsonify({"error": f"File is too large (max {max_mb} MB)"}), 413

    content_type, ext = _detect_file_type(data)
    if not content_type:
        return jsonify({"error": "Only JPG, PNG, WebP images or PDF files are allowed"}), 400

    inv = PatientInvestigation(patient_id=patient.id)
    form = request.form.to_dict()
    form.setdefault("title", "")
    err = _apply_investigation_fields(inv, form, patient.id)
    if err:
        return jsonify({"error": err}), 400

    inv.storage_key = f"patients/{patient.id}/{uuid.uuid4().hex}{ext}"
    inv.original_filename = os.path.basename(upload.filename)[:255]
    inv.content_type = content_type
    inv.file_size = len(data)
    inv.uploaded_by = int(get_jwt_identity())

    try:
        storage.save(inv.storage_key, data, content_type)
    except storage.StorageError as e:
        return jsonify({"error": str(e)}), 502

    try:
        db.session.add(inv)
        db.session.commit()
    except Exception:
        db.session.rollback()
        try:  # don't leave an orphan file behind
            storage.delete(inv.storage_key)
        except storage.StorageError:
            current_app.logger.warning("Orphan upload left at %s", inv.storage_key)
        raise
    return jsonify(inv.to_dict()), 201


@patients_bp.route("/<int:patient_id>/investigations/<int:inv_id>/file", methods=["GET"])
@jwt_required()
def get_investigation_file(patient_id, inv_id):
    """Stream the file to a logged-in user. The bucket itself stays private."""
    inv = _get_investigation(patient_id, inv_id)
    try:
        data = storage.load(inv.storage_key)
    except storage.StorageError as e:
        return jsonify({"error": str(e)}), 502
    resp = Response(data, mimetype=inv.content_type)
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@patients_bp.route("/<int:patient_id>/investigations/<int:inv_id>", methods=["PUT"])
@jwt_required()
def update_investigation(patient_id, inv_id):
    inv = _get_investigation(patient_id, inv_id)
    if not _can_modify(inv):
        return jsonify({"error": "Only an admin or the person who uploaded it can edit this"}), 403
    err = _apply_investigation_fields(inv, request.get_json() or {}, patient_id)
    if err:
        db.session.rollback()
        return jsonify({"error": err}), 400
    db.session.commit()
    return jsonify(inv.to_dict())


@patients_bp.route("/<int:patient_id>/investigations/<int:inv_id>", methods=["DELETE"])
@jwt_required()
def delete_investigation(patient_id, inv_id):
    inv = _get_investigation(patient_id, inv_id)
    if not _can_modify(inv):
        return jsonify({"error": "Only an admin or the person who uploaded it can delete this"}), 403
    try:
        storage.delete(inv.storage_key)
    except storage.StorageError as e:
        return jsonify({"error": str(e)}), 502
    db.session.delete(inv)
    db.session.commit()
    return jsonify({"message": "Investigation deleted"})
