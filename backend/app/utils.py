from datetime import date
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def admin_required():
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") != "admin":
                return jsonify({"error": "Admin access required"}), 403
            return fn(*args, **kwargs)

        return decorator

    return wrapper


def generate_sale_number():
    from datetime import datetime

    return f"S{datetime.now().strftime('%Y%m%d%H%M%S')}"


def validate_medicine_for_sale(medicine, quantity, warning_days=30):
    """Returns (ok, error_message)."""
    if medicine.is_expired:
        return False, f"{medicine.name} is expired and cannot be sold"
    if medicine.stock_quantity < quantity:
        return (
            False,
            f"Insufficient stock for {medicine.name}. Available: {medicine.stock_quantity}",
        )
    if quantity <= 0:
        return False, "Quantity must be at least 1"
    return True, None
