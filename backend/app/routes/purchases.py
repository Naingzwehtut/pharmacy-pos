"""Suppliers and stock receiving (purchases / goods-received notes)."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app import inventory
from app.models import Medicine, Purchase, Supplier, db
from app.timeutil import local_today, parse_date
from app.utils import (
    clean_text, current_user_id, error, generate_purchase_number, role_required, to_int, to_number,
)

purchases_bp = Blueprint("purchases", __name__)

STOCK_ROLES = ("admin", "pharmacist")


# ------------------------------- suppliers ---------------------------------


def _apply_supplier(supplier, data):
    if "name" in data:
        name = clean_text(data.get("name"), 200)
        if not name:
            return "Supplier name is required"
        supplier.name = name
    for field, max_len in (("contact_person", 200), ("phone", 50), ("address", None), ("notes", None)):
        if field in data:
            setattr(supplier, field, clean_text(data.get(field), max_len))
    return None


@purchases_bp.route("/suppliers", methods=["GET"])
@jwt_required()
@role_required(*STOCK_ROLES)
def list_suppliers():
    search = request.args.get("search", "").strip()
    query = Supplier.query
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Supplier.name.ilike(like), Supplier.phone.ilike(like)))
    return jsonify([s.to_dict() for s in query.order_by(Supplier.name).all()])


@purchases_bp.route("/suppliers", methods=["POST"])
@jwt_required()
@role_required(*STOCK_ROLES)
def create_supplier():
    data = request.get_json() or {}
    supplier = Supplier(name="")
    data.setdefault("name", "")
    err = _apply_supplier(supplier, data)
    if err:
        return error(err)
    db.session.add(supplier)
    db.session.commit()
    return jsonify(supplier.to_dict()), 201


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["PUT"])
@jwt_required()
@role_required(*STOCK_ROLES)
def update_supplier(supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    err = _apply_supplier(supplier, request.get_json() or {})
    if err:
        db.session.rollback()
        return error(err)
    db.session.commit()
    return jsonify(supplier.to_dict())


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_supplier(supplier_id):
    supplier = Supplier.query.get_or_404(supplier_id)
    if Purchase.query.filter_by(supplier_id=supplier_id).first():
        return error("This supplier has purchase records and cannot be deleted", 409)
    db.session.delete(supplier)
    db.session.commit()
    return jsonify({"message": "Supplier deleted"})


# ------------------------------- purchases ---------------------------------


@purchases_bp.route("/purchases", methods=["GET"])
@jwt_required()
@role_required(*STOCK_ROLES)
def list_purchases():
    query = Purchase.query.options(selectinload(Purchase.batches))
    supplier_id = request.args.get("supplier_id", type=int)
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    try:
        start = parse_date(request.args.get("start_date"))
        end = parse_date(request.args.get("end_date"))
    except ValueError:
        return error("Invalid date")
    if start:
        query = query.filter(Purchase.purchase_date >= start)
    if end:
        query = query.filter(Purchase.purchase_date <= end)
    rows = query.order_by(Purchase.purchase_date.desc(), Purchase.id.desc()).limit(300).all()
    return jsonify([p.to_dict() for p in rows])


@purchases_bp.route("/purchases/<int:purchase_id>", methods=["GET"])
@jwt_required()
@role_required(*STOCK_ROLES)
def get_purchase(purchase_id):
    return jsonify(Purchase.query.get_or_404(purchase_id).to_dict())


@purchases_bp.route("/purchases", methods=["POST"])
@jwt_required()
@role_required(*STOCK_ROLES)
def create_purchase():
    """Receive stock. Each line becomes a new batch with its own expiry date.

    Line: {medicine_id, quantity, unit: unit|strip|box, unit_cost (per that unit),
           batch_number?, expiry_date, selling_price? (new price per base unit)}
    """
    data = request.get_json() or {}
    lines = data.get("items") or []
    if not lines:
        return error("Add at least one medicine")

    supplier = None
    if data.get("supplier_id"):
        supplier = db.session.get(Supplier, int(data["supplier_id"]))
        if not supplier:
            return error("Supplier not found", 404)

    try:
        purchase_date = parse_date(data.get("purchase_date")) or local_today()
    except ValueError:
        return error("Invalid purchase date")

    purchase = Purchase(
        purchase_number=generate_purchase_number(),
        supplier=supplier,
        invoice_number=clean_text(data.get("invoice_number"), 100),
        purchase_date=purchase_date,
        notes=clean_text(data.get("notes")),
        created_by=current_user_id(),
        total_cost=0,
    )
    db.session.add(purchase)
    db.session.flush()

    total = 0.0
    for i, line in enumerate(lines, start=1):
        medicine = db.session.get(Medicine, int(line.get("medicine_id") or 0))
        if not medicine:
            db.session.rollback()
            return error(f"Line {i}: medicine not found", 404)
        qty, err = to_int(line.get("quantity"), f"Line {i} quantity", minimum=1)
        if err:
            db.session.rollback()
            return error(err)
        unit = line.get("unit") or "unit"
        size = {"unit": 1, "strip": medicine.strip_size, "box": medicine.box_size}.get(unit)
        if not size:
            db.session.rollback()
            return error(f"Line {i}: {medicine.name} has no '{unit}' pack size set")
        unit_cost, err = to_number(line.get("unit_cost"), f"Line {i} cost")
        if err:
            db.session.rollback()
            return error(err)
        try:
            expiry = parse_date(line.get("expiry_date"))
        except ValueError:
            db.session.rollback()
            return error(f"Line {i}: invalid expiry date")
        if not expiry:
            db.session.rollback()
            return error(f"Line {i}: expiry date is required for {medicine.name}")
        if expiry < local_today():
            db.session.rollback()
            return error(f"Line {i}: {medicine.name} is already expired ({expiry.isoformat()})")

        base_qty = qty * size
        cost_per_base = round(unit_cost / size, 4)
        inventory.add_batch(
            medicine, base_qty, expiry, cost_per_base,
            batch_number=clean_text(line.get("batch_number"), 80),
            purchase=purchase, reason="purchase",
            reference=purchase.purchase_number, user_id=current_user_id(),
        )
        if line.get("selling_price") not in (None, ""):
            price, err = to_number(line.get("selling_price"), f"Line {i} selling price")
            if err:
                db.session.rollback()
                return error(err)
            medicine.selling_price = price
        total += unit_cost * qty

    purchase.total_cost = round(total, 2)
    db.session.commit()
    return jsonify(purchase.to_dict()), 201
