from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, current_user, jwt_required

from app.models import User, db
from app.utils import error

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 6


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return error("Username and password required")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return error("Invalid credentials", 401)
    if user.is_active is False:
        return error("This account has been deactivated", 403)

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "username": user.username},
    )
    return jsonify({"access_token": token, "user": user.to_dict()})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    return jsonify(current_user.to_dict())


@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    data = request.get_json() or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if not current_user.check_password(current):
        return error("Current password is incorrect")
    if len(new) < MIN_PASSWORD_LENGTH:
        return error(f"New password must be at least {MIN_PASSWORD_LENGTH} characters")
    current_user.set_password(new)
    db.session.commit()
    return jsonify({"message": "Password changed"})
