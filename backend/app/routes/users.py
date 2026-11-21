"""User management (admin only)."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import current_user, jwt_required

from app.models import ROLES, User, db
from app.routes.auth import MIN_PASSWORD_LENGTH
from app.utils import admin_required, clean_text, error

users_bp = Blueprint("users", __name__)


def _active_admins_excluding(user_id):
    return User.query.filter(
        User.role == "admin", User.is_active.isnot(False), User.id != user_id
    ).count()


@users_bp.route("", methods=["GET"])
@jwt_required()
@admin_required()
def list_users():
    return jsonify([u.to_dict() for u in User.query.order_by(User.username).all()])


@users_bp.route("", methods=["POST"])
@jwt_required()
@admin_required()
def create_user():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role") or "cashier"
    if not username:
        return error("Username is required")
    if len(username) > 80 or " " in username:
        return error("Username cannot contain spaces (max 80 characters)")
    if role not in ROLES:
        return error("Invalid role")
    if len(password) < MIN_PASSWORD_LENGTH:
        return error(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if User.query.filter_by(username=username).first():
        return error("That username is already taken", 409)
    user = User(username=username, role=role, full_name=clean_text(data.get("full_name"), 200))
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201


@users_bp.route("/<int:user_id>", methods=["PUT"])
@jwt_required()
@admin_required()
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    if "full_name" in data:
        user.full_name = clean_text(data.get("full_name"), 200)

    demoting = "role" in data and data["role"] != "admin" and user.role == "admin"
    deactivating = data.get("is_active") is False and user.is_active is not False
    if (demoting or deactivating) and _active_admins_excluding(user.id) == 0:
        return error("Keep at least one active admin account")
    if user.id == current_user.id and deactivating:
        return error("You cannot deactivate your own account")

    if "role" in data:
        if data["role"] not in ROLES:
            return error("Invalid role")
        user.role = data["role"]
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if data.get("password"):
        if len(data["password"]) < MIN_PASSWORD_LENGTH:
            return error(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        user.set_password(data["password"])

    db.session.commit()
    return jsonify(user.to_dict())
