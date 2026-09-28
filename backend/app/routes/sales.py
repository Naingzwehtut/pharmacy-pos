from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from app.models import Medicine, Patient, Sale, SaleItem, db
from app.utils import generate_sale_number, validate_medicine_for_sale

sales_bp = Blueprint("sales", __name__)


@sales_bp.route("", methods=["GET"])
@jwt_required()
def list_sales():
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    sale_number = request.args.get("sale_number", "").strip()
    patient_id = request.args.get("patient_id", type=int)

    query = Sale.query

    if patient_id:
        query = query.filter(Sale.patient_id == patient_id)

    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.filter(Sale.created_at >= start)
        except ValueError:
            return jsonify({"error": "Invalid start_date"}), 400

    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            query = query.filter(Sale.created_at <= end)
        except ValueError:
            return jsonify({"error": "Invalid end_date"}), 400

    if sale_number:
        query = query.filter(Sale.sale_number.ilike(f"%{sale_number}%"))

    sales = query.order_by(Sale.created_at.desc()).limit(500).all()
    return jsonify([s.to_dict() for s in sales])


@sales_bp.route("/<int:sale_id>", methods=["GET"])
@jwt_required()
def get_sale(sale_id):
    sale = Sale.query.get_or_404(sale_id)
    return jsonify(sale.to_dict())


def _parse_fee(data, key):
    """Returns (value, error_response)."""
    try:
        value = float(data.get(key, 0) or 0)
    except (TypeError, ValueError):
        return None, (jsonify({"error": f"{key} must be a number"}), 400)
    if value < 0:
        return None, (jsonify({"error": f"{key} cannot be negative"}), 400)
    return value, None


def _text(data, key):
    return (data.get(key) or "").strip() or None


@sales_bp.route("/checkout", methods=["POST"])
@jwt_required()
def checkout():
    data = request.get_json() or {}
    items = data.get("items", [])
    cashier_id = int(get_jwt_identity())

    delivery_fee, err = _parse_fee(data, "delivery_fee")
    if err:
        return err
    doctor_fee, err = _parse_fee(data, "doctor_fee")
    if err:
        return err

    # Patient (optional). If chosen, the visit is saved in their history.
    patient = None
    patient_id = data.get("patient_id")
    if patient_id:
        patient = Patient.query.get(patient_id)
        if not patient:
            return jsonify({"error": "Patient not found"}), 404

    customer_name = _text(data, "customer_name") or (patient.name if patient else None)
    customer_address = _text(data, "customer_address") or (
        patient.address if patient else None
    )

    if delivery_fee > 0:
        if not customer_name:
            return jsonify({"error": "Customer name is required for delivery orders"}), 400
        if not customer_address:
            return jsonify({"error": "Customer address is required for delivery orders"}), 400

    # A consultation with no medicines is allowed, as long as there is a doctor fee.
    if not items and doctor_fee <= 0:
        return jsonify({"error": "Add a medicine or a doctor fee"}), 400

    # Merge duplicate lines so the stock check covers the total requested.
    merged = {}
    for item in items:
        try:
            medicine_id = int(item.get("medicine_id"))
            quantity = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid item in cart"}), 400
        line = merged.setdefault(
            medicine_id, {"quantity": 0, "dosage": None}
        )
        line["quantity"] += quantity
        dosage = (item.get("dosage") or "").strip()
        if dosage:
            line["dosage"] = dosage[:300]

    sale = Sale(
        sale_number=generate_sale_number(),
        subtotal=0,
        delivery_fee=delivery_fee,
        doctor_fee=doctor_fee,
        doctor_name=_text(data, "doctor_name"),
        symptoms=_text(data, "symptoms"),
        diagnosis=_text(data, "diagnosis"),
        visit_notes=_text(data, "visit_notes"),
        patient_id=patient.id if patient else None,
        customer_name=customer_name,
        customer_address=customer_address,
        total_amount=0,
        total_cost=0,
        total_profit=0,
        cashier_id=cashier_id,
    )

    subtotal = 0
    total_cost = 0
    total_profit = 0
    sale_items = []

    for medicine_id, line in merged.items():
        quantity = line["quantity"]

        medicine = Medicine.query.get(medicine_id)
        if not medicine:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404

        ok, err = validate_medicine_for_sale(medicine, quantity)
        if not ok:
            return jsonify({"error": err}), 400

        cost = float(medicine.cost_price)
        selling = float(medicine.selling_price)
        line_total = selling * quantity
        line_profit = (selling - cost) * quantity

        sale_item = SaleItem(
            medicine_id=medicine.id,
            medicine_name=medicine.name,
            quantity=quantity,
            cost_price=cost,
            selling_price=selling,
            line_total=line_total,
            line_profit=line_profit,
            dosage=line["dosage"],
        )
        sale_items.append((sale_item, medicine, quantity))
        subtotal += line_total
        total_cost += cost * quantity
        total_profit += line_profit

    sale.subtotal = subtotal
    sale.total_amount = subtotal + delivery_fee + doctor_fee
    sale.total_cost = total_cost
    # Delivery and doctor fees carry no product cost, so they count as profit.
    sale.total_profit = total_profit + delivery_fee + doctor_fee
    db.session.add(sale)
    db.session.flush()

    # Stock leaves the pharmacy here, in the same transaction as the sale.
    for sale_item, medicine, quantity in sale_items:
        sale_item.sale_id = sale.id
        medicine.stock_quantity -= quantity
        db.session.add(sale_item)

    db.session.commit()
    return jsonify(sale.to_dict()), 201
