from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_

from app.models import Patient, Sale, db
from app.utils import admin_required

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
    if "date_of_birth" in data:
        raw = _clean(data["date_of_birth"])
        if raw is None:
            patient.date_of_birth = None
        else:
            try:
                dob = date.fromisoformat(raw)
            except ValueError:
                return "Invalid date_of_birth format (YYYY-MM-DD)"
            if dob > date.today():
                return "Date of birth cannot be in the future"
            patient.date_of_birth = dob
    return None


def _patient_with_stats(patient):
    d = patient.to_dict()
    visits = patient.visits
    d["visit_count"] = len(visits)
    d["last_visit"] = visits[0].created_at.isoformat() if visits else None
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
            )
        )
    patients = query.order_by(Patient.name).limit(limit).all()
    return jsonify([_patient_with_stats(p) for p in patients])


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
    visits = patient.visits  # newest first
    result = _patient_with_stats(patient)
    result["visits"] = [v.to_dict() for v in visits]
    result["total_doctor_fees"] = sum(float(v.doctor_fee or 0) for v in visits)
    result["total_spent"] = sum(float(v.total_amount) for v in visits)
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
    db.session.delete(patient)
    db.session.commit()
    return jsonify({"message": "Patient deleted"})
