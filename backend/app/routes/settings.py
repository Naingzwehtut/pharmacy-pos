from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.models import AppSetting
from app.utils import admin_required

settings_bp = Blueprint("settings", __name__)

DELIVERY_FEE_KEY = "default_delivery_fee"
PHARMACY_NAME_KEY = "pharmacy_name"
PHARMACY_ADDRESS_KEY = "pharmacy_address"
PHARMACY_PHONE_KEY = "pharmacy_phone"


def _receipt_settings():
    return {
        "pharmacy_name": AppSetting.get(PHARMACY_NAME_KEY, "Pharmacy POS"),
        "pharmacy_address": AppSetting.get(PHARMACY_ADDRESS_KEY, ""),
        "pharmacy_phone": AppSetting.get(PHARMACY_PHONE_KEY, ""),
    }


@settings_bp.route("/receipt", methods=["GET"])
@jwt_required()
def get_receipt_settings():
    return jsonify(_receipt_settings())


@settings_bp.route("/receipt", methods=["PUT"])
@jwt_required()
@admin_required()
def update_receipt_settings():
    data = request.get_json() or {}
    name = (data.get("pharmacy_name") or "").strip()
    if not name:
        return jsonify({"error": "pharmacy_name is required"}), 400

    AppSetting.set(PHARMACY_NAME_KEY, name)
    AppSetting.set(PHARMACY_ADDRESS_KEY, (data.get("pharmacy_address") or "").strip())
    AppSetting.set(PHARMACY_PHONE_KEY, (data.get("pharmacy_phone") or "").strip())
    return jsonify(_receipt_settings())


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
