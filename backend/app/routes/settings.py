from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.models import AppSetting, db
from app.utils import admin_required, error, to_number

settings_bp = Blueprint("settings", __name__)

DELIVERY_FEE_KEY = "default_delivery_fee"
DOCTOR_FEE_KEY = "default_doctor_fee"
PHARMACY_NAME_KEY = "pharmacy_name"
PHARMACY_ADDRESS_KEY = "pharmacy_address"
PHARMACY_PHONE_KEY = "pharmacy_phone"

# key -> (type, default). Every setting is readable by any signed-in user
# (the till needs them) and writable only by an admin.
SETTINGS = {
    "pharmacy_name": ("text", "Zwe Pharmacy"),
    "pharmacy_name_mm": ("text", "ဇွဲ ဆေးဆိုင်"),
    "pharmacy_address": ("text", ""),
    "pharmacy_phone": ("text", ""),
    "receipt_footer": ("text", "Thank you for your purchase."),
    "receipt_footer_mm": ("text", "ကျေးဇူးတင်ပါသည်။ ကျန်းမာပါစေ။"),
    "receipt_language": ("choice:en,my,both", "both"),
    "receipt_myanmar_digits": ("bool", "false"),
    "receipt_paper": ("choice:80mm,58mm,a5", "80mm"),
    "currency_label": ("text", "Ks"),
    "default_delivery_fee": ("number", "0"),
    "default_doctor_fee": ("number", "0"),
    "cashier_max_discount_percent": ("number", "10"),
    "enabled_payment_methods": ("text", "cash,kbzpay,wavepay,ayapay,cbpay,mpu_card,bank_transfer,credit"),
}


def _value(key):
    kind, default = SETTINGS[key]
    raw = AppSetting.get(key, default)
    if kind == "number":
        try:
            return float(raw)
        except (TypeError, ValueError):
            return float(default)
    if kind == "bool":
        return str(raw).lower() == "true"
    return raw


def all_settings():
    return {key: _value(key) for key in SETTINGS}


@settings_bp.route("", methods=["GET"])
@jwt_required()
def get_settings():
    return jsonify(all_settings())


@settings_bp.route("", methods=["PUT"])
@jwt_required()
@admin_required()
def update_settings():
    data = request.get_json() or {}
    for key, value in data.items():
        if key not in SETTINGS:
            continue
        kind, _ = SETTINGS[key]
        if key == "pharmacy_name" and not (value or "").strip():
            return error("Pharmacy name is required")
        if kind == "number":
            number, err = to_number(value, key.replace("_", " "))
            if err:
                db.session.rollback()
                return error(err)
            if key == "cashier_max_discount_percent" and number > 100:
                db.session.rollback()
                return error("Discount limit cannot be more than 100%")
            value = number
        elif kind == "bool":
            value = "true" if value in (True, "true", "1", 1) else "false"
        elif kind.startswith("choice:"):
            if value not in kind[7:].split(","):
                db.session.rollback()
                return error(f"Invalid value for {key}")
        else:
            value = (str(value) if value is not None else "").strip()[:255]
        AppSetting.set(key, value, commit=False)
    db.session.commit()
    return jsonify(all_settings())


# ---- v1 endpoints, kept so older clients keep working ----


def _receipt_settings():
    return {
        "pharmacy_name": _value("pharmacy_name"),
        "pharmacy_address": _value("pharmacy_address"),
        "pharmacy_phone": _value("pharmacy_phone"),
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
        return error("pharmacy_name is required")
    AppSetting.set(PHARMACY_NAME_KEY, name, commit=False)
    AppSetting.set(PHARMACY_ADDRESS_KEY, (data.get("pharmacy_address") or "").strip(), commit=False)
    AppSetting.set(PHARMACY_PHONE_KEY, (data.get("pharmacy_phone") or "").strip(), commit=False)
    db.session.commit()
    return jsonify(_receipt_settings())


def _fee_endpoints(key, field):
    def get_fee():
        return jsonify({field: _value(key)})

    def put_fee():
        data = request.get_json() or {}
        if field not in data:
            return error(f"{field} is required")
        fee, err = to_number(data[field], field)
        if err:
            return error(err)
        AppSetting.set(key, fee)
        return jsonify({field: fee})

    return get_fee, put_fee


for _key, _field, _path in (
    (DELIVERY_FEE_KEY, "delivery_fee", "/delivery-fee"),
    (DOCTOR_FEE_KEY, "doctor_fee", "/doctor-fee"),
):
    _get, _put = _fee_endpoints(_key, _field)
    settings_bp.add_url_rule(_path, f"get_{_field}", jwt_required()(_get), methods=["GET"])
    settings_bp.add_url_rule(
        _path, f"put_{_field}", jwt_required()(admin_required()(_put)), methods=["PUT"]
    )
