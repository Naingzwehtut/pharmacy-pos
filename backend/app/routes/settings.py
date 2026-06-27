from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.models import AppSetting
from app.utils import admin_required

settings_bp = Blueprint("settings", __name__)

DELIVERY_FEE_KEY = "default_delivery_fee"


@settings_bp.route("/delivery-fee", methods=["GET"])
@jwt_required()
def get_delivery_fee():
    value = AppSetting.get(DELIVERY_FEE_KEY, "0")
    return jsonify({"delivery_fee": float(value)})


@settings_bp.route("/delivery-fee", methods=["PUT"])
@jwt_required()
@admin_required()
def update_delivery_fee():
    data = request.get_json() or {}
    if "delivery_fee" not in data:
        return jsonify({"error": "delivery_fee is required"}), 400

    try:
        fee = float(data["delivery_fee"])
    except (TypeError, ValueError):
        return jsonify({"error": "delivery_fee must be a number"}), 400

    if fee < 0:
        return jsonify({"error": "delivery_fee cannot be negative"}), 400

    AppSetting.set(DELIVERY_FEE_KEY, fee)
    return jsonify({"delivery_fee": fee})
