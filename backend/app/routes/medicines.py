from datetime import date

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app.models import Medicine, db
from app.utils import admin_required

medicines_bp = Blueprint("medicines", __name__)


@medicines_bp.route("", methods=["GET"])
@jwt_required()
def list_medicines():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()
    include_expired = request.args.get("include_expired", "false").lower() == "true"
    pos_only = request.args.get("pos", "false").lower() == "true"

    query = Medicine.query

    if search:
        query = query.filter(
            or_(
                Medicine.name.ilike(f"%{search}%"),
                Medicine.category.ilike(f"%{search}%"),
            )
        )
    if category:
        query = query.filter(Medicine.category.ilike(f"%{category}%"))
    if pos_only and not include_expired:
        query = query.filter(Medicine.expiry_date >= date.today())
        query = query.filter(Medicine.stock_quantity > 0)

    medicines = query.order_by(Medicine.name).all()
    warning_days = current_app.config["EXPIRY_WARNING_DAYS"]
    return jsonify([m.to_dict(warning_days) for m in medicines])


@medicines_bp.route("/categories", methods=["GET"])
@jwt_required()
def list_categories():
    rows = db.session.query(Medicine.category).distinct().order_by(Medicine.category)
    return jsonify([r[0] for r in rows])


@medicines_bp.route("/<int:medicine_id>", methods=["GET"])
@jwt_required()
def get_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    return jsonify(medicine.to_dict(current_app.config["EXPIRY_WARNING_DAYS"]))


@medicines_bp.route("", methods=["POST"])
@jwt_required()
@admin_required()
def create_medicine():
    data = request.get_json() or {}
    required = [
        "name",
        "category",
        "stock_quantity",
        "cost_price",
        "selling_price",
        "expiry_date",
    ]
    for field in required:
        if field not in data or data[field] == "":
            return jsonify({"error": f"{field} is required"}), 400

    try:
        expiry = date.fromisoformat(data["expiry_date"])
    except ValueError:
        return jsonify({"error": "Invalid expiry_date format (YYYY-MM-DD)"}), 400

    medicine = Medicine(
        name=data["name"].strip(),
        category=data["category"].strip(),
        stock_quantity=int(data["stock_quantity"]),
        cost_price=data["cost_price"],
        selling_price=data["selling_price"],
        expiry_date=expiry,
    )
    db.session.add(medicine)
    db.session.commit()
    return jsonify(medicine.to_dict(current_app.config["EXPIRY_WARNING_DAYS"])), 201


@medicines_bp.route("/<int:medicine_id>", methods=["PUT"])
@jwt_required()
@admin_required()
def update_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    data = request.get_json() or {}

    if "name" in data:
        medicine.name = data["name"].strip()
    if "category" in data:
        medicine.category = data["category"].strip()
    if "stock_quantity" in data:
        medicine.stock_quantity = int(data["stock_quantity"])
    if "cost_price" in data:
        medicine.cost_price = data["cost_price"]
    if "selling_price" in data:
        medicine.selling_price = data["selling_price"]
    if "expiry_date" in data:
        try:
            medicine.expiry_date = date.fromisoformat(data["expiry_date"])
        except ValueError:
            return jsonify({"error": "Invalid expiry_date format"}), 400

    db.session.commit()
    return jsonify(medicine.to_dict(current_app.config["EXPIRY_WARNING_DAYS"]))


@medicines_bp.route("/<int:medicine_id>", methods=["DELETE"])
@jwt_required()
@admin_required()
def delete_medicine(medicine_id):
    medicine = Medicine.query.get_or_404(medicine_id)
    db.session.delete(medicine)
    db.session.commit()
    return jsonify({"message": "Medicine deleted"})
