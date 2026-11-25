import secrets
from functools import wraps

from flask import jsonify
from flask_jwt_extended import current_user, get_jwt_identity, verify_jwt_in_request

from app.timeutil import local_now


def role_required(*roles):
    """Allow only the given roles. The role is read from the database, so a
    changed role or a deactivated account takes effect immediately."""

    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            verify_jwt_in_request()
            if current_user is None or current_user.role not in roles:
                return jsonify({"error": "You do not have permission to do this"}), 403
            return fn(*args, **kwargs)

        return decorator

    return wrapper


def admin_required():
    return role_required("admin")


def current_user_id():
    return int(get_jwt_identity())


def current_role():
    return current_user.role if current_user is not None else None


def _number(prefix):
    # Local time in the number, plus a random suffix so two sales in the
    # same second never clash.
    return f"{prefix}{local_now().strftime('%Y%m%d%H%M%S')}{secrets.token_hex(2).upper()}"


def generate_sale_number():
    return _number("S")


def generate_purchase_number():
    return _number("GRN")


def to_number(value, name, minimum=0, allow_none=False):
    """Parse a non-negative number from request data. Returns (value, error)."""
    if value is None or value == "":
        if allow_none:
            return None, None
        value = 0
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None, f"{name} must be a number"
    if value != value or value in (float("inf"), float("-inf")):
        return None, f"{name} must be a number"
    if minimum is not None and value < minimum:
        return None, f"{name} cannot be less than {minimum:g}"
    return value, None


def to_int(value, name, minimum=0, allow_none=False):
    if value is None or value == "":
        if allow_none:
            return None, None
        value = 0
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, f"{name} must be a whole number"
    if number != int(number):
        return None, f"{name} must be a whole number"
    number = int(number)
    if minimum is not None and number < minimum:
        return None, f"{name} cannot be less than {minimum}"
    return number, None


def clean_text(value, max_len=None):
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    return value[:max_len] if max_len else value


def error(message, status=400):
    return jsonify({"error": message}), status
