from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from app.models import Medicine, Sale, SaleItem, db
from app.utils import generate_sale_number, validate_medicine_for_sale

sales_bp = Blueprint("sales", __name__)


@sales_bp.route("", methods=["GET"])
@jwt_required()
def list_sales():
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    sale_number = request.args.get("sale_number", "").strip()

    query = Sale.query

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


@sales_bp.route("/checkout", methods=["POST"])
@jwt_required()
def checkout():
    data = request.get_json() or {}
    items = data.get("items", [])
    cashier_id = int(get_jwt_identity())

    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    sale = Sale(
        sale_number=generate_sale_number(),
        total_amount=0,
        total_cost=0,
        total_profit=0,
        cashier_id=cashier_id,
    )

    total_amount = 0
    total_cost = 0
    total_profit = 0
    sale_items = []

    for item in items:
        medicine_id = item.get("medicine_id")
        quantity = int(item.get("quantity", 0))

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
        )
        sale_items.append((sale_item, medicine, quantity))
        total_amount += line_total
        total_cost += cost * quantity
        total_profit += line_profit

    sale.total_amount = total_amount
    sale.total_cost = total_cost
    sale.total_profit = total_profit
    db.session.add(sale)
    db.session.flush()

    for sale_item, medicine, quantity in sale_items:
        sale_item.sale_id = sale.id
        medicine.stock_quantity -= quantity
        db.session.add(sale_item)

    db.session.commit()
    return jsonify(sale.to_dict()), 201
