from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload

from app import inventory
from app.models import Medicine, MedicineBatch, SaleItem, StockMovement, db
from app.timeutil import local_date_expr, local_today, parse_date
from app.utils import (
    clean_text, current_role, current_user_id, error, role_required, to_int, to_number,
)

medicines_bp = Blueprint("medicines", __name__)

STOCK_ROLES = ("admin", "pharmacist")
COST_FIELDS = ("cost_price", "profit_per_unit")


def _warning_days():
    return current_app.config["EXPIRY_WARNING_DAYS"]


def _public(d):
    """Cashiers do not see purchase costs."""
    if current_role() == "cashier":
        for key in COST_FIELDS:
            d.pop(key, None)
        for b in d.get("batches", []):
            b.pop("cost_price", None)
            b.pop("stock_value", None)
    return d


@medicines_bp.route("", methods=["GET"])
@jwt_required()
def list_medicines():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()
    include_expired = request.args.get("include_expired", "false").lower() == "true"
    pos_only = request.args.get("pos", "false").lower() == "true"
    added_date = request.args.get("added_date", "").strip()
    status = request.args.get("status", "").strip()  # low | expiring | expired | inactive
    limit = request.args.get("limit", type=int)

    query = Medicine.query.options(selectinload(Medicine.batches))

    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Medicine.name.ilike(like),
                Medicine.generic_name.ilike(like),
                Medicine.name_mm.ilike(like),
                Medicine.category.ilike(like),
                Medicine.barcode == search,
            )
        )
    if category:
        query = query.filter(Medicine.category.ilike(f"%{category}%"))
    if status == "inactive":
        query = query.filter(Medicine.is_active.is_(False))
    elif pos_only or status:
        query = query.filter(Medicine.is_active.isnot(False))
    if pos_only and not include_expired:
        query = query.filter(Medicine.stock_quantity > 0)
    if status == "low":
        query = query.filter(Medicine.stock_quantity <= Medicine.reorder_level)
    if added_date:
        try:
            target_date = parse_date(added_date)
        except ValueError:
            return error("Invalid added_date format (YYYY-MM-DD)")
        query = query.filter(local_date_expr(Medicine.created_at) == target_date.isoformat())

    medicines = query.order_by(Medicine.name).all()
    warning_days = _warning_days()
    result = [m.to_dict(warning_days) for m in medicines]
    if pos_only and not include_expired:
        result = [m for m in result if m["sellable_quantity"] > 0]
    if status == "expiring":
        result = [m for m in result if m["expiry_status"] == "warning"]
    elif status == "expired":
        result = [m for m in result if m["expired_quantity"] > 0]
    if limit:
        result = result[:limit]
    return jsonify([_public(m) for m in result])


@medicines_bp.route("/categories", methods=["GET"])
@jwt_required()
def list_categories():
    rows = db.session.query(Medicine.category).distinct().order_by(Medicine.category)
    return jsonify([r[0] for r in rows if r[0]])


@medicines_bp.route("/barcode/<path:code>", methods=["GET"])
@jwt_required()
def find_by_barcode(code):
    medicine = Medicine.query.filter(Medicine.barcode == code.strip()).first()
    if not medicine:
        return error("No medicine with this barcode", 404)
    return jsonify(_public(medicine.to_dict(_warning_days())))


@medicines_bp.route("/<int:medicine_id>", methods=["GET"])
@jwt_required()
def get_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    return jsonify(_public(medicine.to_dict(_warning_days(), include_batches=True)))


def _apply_fields(medicine, data, creating):
    """Copy editable fields onto the medicine. Returns an error message or None."""
    if creating:
        for field in ("name", "category", "selling_price"):
            if data.get(field) in (None, ""):
                return f"{field} is required"

    for field, max_len in (("name", 200), ("category", 100)):
        if field in data:
            value = clean_text(data.get(field), max_len)
            if not value:
                return f"{field} is required"
            setattr(medicine, field, value)

    for field, max_len in (
        ("generic_name", 200), ("name_mm", 200), ("manufacturer", 200),
        ("shelf_location", 50),
    ):
        if field in data:
            setattr(medicine, field, clean_text(data.get(field), max_len))

    if "barcode" in data:
        barcode = clean_text(data.get("barcode"), 64)
        if barcode:
            clash = Medicine.query.filter(Medicine.barcode == barcode, Medicine.id != medicine.id).first()
            if clash:
                return f"Barcode already used by {clash.name}"
        medicine.barcode = barcode

    if "unit_name" in data:
        medicine.unit_name = clean_text(data.get("unit_name"), 30) or "tablet"
    if "requires_prescription" in data:
        medicine.requires_prescription = bool(data.get("requires_prescription"))
    if "is_active" in data:
        medicine.is_active = bool(data.get("is_active"))

    if "reorder_level" in data:
        value, err = to_int(data.get("reorder_level"), "Reorder level")
        if err:
            return err
        medicine.reorder_level = value

    for field, label in (("selling_price", "Selling price"), ("cost_price", "Cost price")):
        if field in data:
            value, err = to_number(data.get(field), label)
            if err:
                return err
            setattr(medicine, field, value)
    if medicine.cost_price is None:
        medicine.cost_price = 0

    for size_field, price_field, label in (
        ("strip_size", "strip_price", "Strip"),
        ("box_size", "box_price", "Box"),
    ):
        if size_field in data:
            size, err = to_int(data.get(size_field), f"{label} size", allow_none=True)
            if err:
                return err
            setattr(medicine, size_field, size if size and size > 1 else None)
        if price_field in data:
            price, err = to_number(data.get(price_field), f"{label} price", allow_none=True)
            if err:
                return err
            setattr(medicine, price_field, price if price else None)
        if getattr(medicine, size_field) is None:
            setattr(medicine, price_field, None)
    return None


@medicines_bp.route("", methods=["POST"])
@jwt_required()
@role_required(*STOCK_ROLES)
def create_medicine():
    data = request.get_json() or {}
    medicine = Medicine(stock_quantity=0, cost_price=0, selling_price=0)
    err = _apply_fields(medicine, data, creating=True)
    if err:
        return error(err)
    db.session.add(medicine)
    db.session.flush()

    # Opening stock (optional): becomes the first batch
    qty, err = to_int(data.get("stock_quantity"), "Stock quantity")
    if err:
        db.session.rollback()
        return error(err)
    if qty > 0:
        try:
            expiry = parse_date(data.get("expiry_date"))
        except ValueError:
            db.session.rollback()
            return error("Invalid expiry_date format (YYYY-MM-DD)")
        if not expiry:
            db.session.rollback()
            return error("Expiry date is required for opening stock")
        inventory.add_batch(
            medicine, qty, expiry, medicine.cost_price,
            batch_number=clean_text(data.get("batch_number"), 80),
            reason="opening", user_id=current_user_id(),
        )
    db.session.commit()
    return jsonify(_public(medicine.to_dict(_warning_days()))), 201


@medicines_bp.route("/<int:medicine_id>", methods=["PUT"])
@jwt_required()
@role_required(*STOCK_ROLES)
def update_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    data = request.get_json() or {}
    err = _apply_fields(medicine, data, creating=False)
    if err:
        db.session.rollback()
        return error(err)
    db.session.commit()
    return jsonify(_public(medicine.to_dict(_warning_days())))


@medicines_bp.route("/<int:medicine_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    if SaleItem.query.filter_by(medicine_id=medicine_id).first():
        return error(
            "This medicine has sales history, so it cannot be deleted. "
            "Mark it inactive instead to hide it from the till.",
            409,
        )
    if any(b.purchase_id for b in medicine.batches):
        return error("This medicine has purchase records. Mark it inactive instead.", 409)
    StockMovement.query.filter_by(medicine_id=medicine_id).delete()
    db.session.delete(medicine)
    db.session.commit()
    return jsonify({"message": "Medicine deleted"})


# ---------------------------------------------------------------------------
# Batches, adjustments and the stock audit trail
# ---------------------------------------------------------------------------


@medicines_bp.route("/<int:medicine_id>/batches", methods=["GET"])
@jwt_required()
def list_batches(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    d = medicine.to_dict(_warning_days(), include_batches=True)
    return jsonify(_public(d)["batches"])


@medicines_bp.route("/<int:medicine_id>/batches/<int:batch_id>", methods=["PUT"])
@jwt_required()
@role_required(*STOCK_ROLES)
def update_batch(medicine_id, batch_id):
    """Correct a batch's number, expiry date or cost (not its quantity)."""
    batch = MedicineBatch.query.filter_by(id=batch_id, medicine_id=medicine_id).first_or_404()
    data = request.get_json() or {}
    if "batch_number" in data:
        batch.batch_number = clean_text(data.get("batch_number"), 80)
    if "expiry_date" in data:
        try:
            expiry = parse_date(data.get("expiry_date"))
        except ValueError:
            return error("Invalid expiry date")
        if not expiry:
            return error("Expiry date is required")
        batch.expiry_date = expiry
    if "cost_price" in data:
        cost, err = to_number(data.get("cost_price"), "Cost price")
        if err:
            return error(err)
        batch.cost_price = cost
    inventory.recalc(batch.medicine)
    db.session.commit()
    return jsonify(batch.to_dict(_warning_days()))


@medicines_bp.route("/<int:medicine_id>/adjust", methods=["POST"])
@jwt_required()
@role_required(*STOCK_ROLES)
def adjust_stock(medicine_id):
    """Body: {change: +/-int, reason, note?, batch_id?, expiry_date? (when adding), cost_price?}"""
    medicine = Medicine.query.get_or_404(medicine_id)
    data = request.get_json() or {}
    try:
        change = int(data.get("change"))
    except (TypeError, ValueError):
        return error("Change must be a whole number (use minus to remove)")
    batch = None
    if data.get("batch_id"):
        batch = MedicineBatch.query.filter_by(id=data["batch_id"], medicine_id=medicine.id).first()
        if not batch:
            return error("Batch not found", 404)
    try:
        expiry = parse_date(data.get("expiry_date"))
    except ValueError:
        return error("Invalid expiry date")
    cost, err = to_number(data.get("cost_price"), "Cost price", allow_none=True)
    if err:
        return error(err)
    try:
        inventory.adjust(
            medicine, change, data.get("reason"), current_user_id(),
            batch=batch, note=clean_text(data.get("note"), 500),
            expiry_date=expiry, cost_price=cost,
        )
    except inventory.StockError as e:
        db.session.rollback()
        return error(str(e))
    db.session.commit()
    return jsonify(_public(medicine.to_dict(_warning_days(), include_batches=True)))


@medicines_bp.route("/movements", methods=["GET"])
@jwt_required()
@role_required(*STOCK_ROLES)
def list_movements():
    query = StockMovement.query
    medicine_id = request.args.get("medicine_id", type=int)
    if medicine_id:
        query = query.filter(StockMovement.medicine_id == medicine_id)
    reason = request.args.get("reason", "").strip()
    if reason:
        query = query.filter(StockMovement.reason.like(f"{reason}%"))
    limit = min(request.args.get("limit", 200, type=int), 1000)
    rows = query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit).all()
    return jsonify([r.to_dict() for r in rows])


@medicines_bp.route("/stock-value", methods=["GET"])
@jwt_required()
@role_required(*STOCK_ROLES)
def stock_value():
    today = local_today()
    rows = db.session.query(
        func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.cost_price), 0),
    ).filter(MedicineBatch.quantity > 0, MedicineBatch.expiry_date >= today).scalar()
    expired = db.session.query(
        func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.cost_price), 0),
    ).filter(MedicineBatch.quantity > 0, MedicineBatch.expiry_date < today).scalar()
    return jsonify({"sellable_value": float(rows), "expired_value": float(expired)})
