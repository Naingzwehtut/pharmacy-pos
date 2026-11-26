"""Desktop app: first-run setup, moving data from the cloud, backups.

Every route here returns 404 unless the app runs as the desktop app, so the
website on Render is not affected.
"""
import os
import sys
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import create_access_token, jwt_required

from app import backup
from app.cloud_import import CloudImportError, import_from_cloud
from app.models import AppSetting, User, db
from app.utils import admin_required

system_bp = Blueprint("system", __name__)

MIN_PASSWORD_LENGTH = 6


def _error(message, status=400):
    return jsonify({"error": message}), status


def _text(value, max_len=255):
    value = (value or "").strip() if isinstance(value, str) else ""
    return value[:max_len] or None


def desktop_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_app.config.get("DESKTOP"):
            return _error("Only available in the desktop app", 404)
        return fn(*args, **kwargs)

    return wrapper


def _needs_setup():
    return User.query.count() == 0


@system_bp.route("/status", methods=["GET"])
def status():
    desktop = bool(current_app.config.get("DESKTOP"))
    return jsonify({
        "desktop": desktop,
        "needs_setup": desktop and _needs_setup(),
        "version": current_app.config.get("APP_VERSION"),
    })


@system_bp.route("/setup", methods=["POST"])
@desktop_only
def setup_owner():
    """First run: create the admin account. Only while there are no users."""
    if not _needs_setup():
        return _error("Setup is already done", 409)
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or " " in username:
        return _error("Choose a username without spaces")
    if len(password) < MIN_PASSWORD_LENGTH:
        return _error(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    user = User(username=username, role="admin")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    for key in ("pharmacy_name", "pharmacy_address", "pharmacy_phone"):
        value = _text(data.get(key))
        if value:
            AppSetting.set(key, value)
    token = create_access_token(identity=str(user.id), additional_claims={"role": "admin", "username": user.username})
    return jsonify({"access_token": token, "user": user.to_dict()}), 201


@system_bp.route("/import-cloud", methods=["POST"])
@desktop_only
def import_cloud():
    """First run: copy everything from the cloud (Supabase) database to this computer."""
    if not _needs_setup():
        return _error("This computer already has data", 409)
    data = request.get_json() or {}
    try:
        summary = import_from_cloud(
            data.get("database_url"),
            supabase_url=_text(data.get("supabase_url"), 500),
            supabase_key=_text(data.get("supabase_key"), 1000),
            bucket=_text(data.get("bucket")) or "investigations",
            log=current_app.logger.info,
        )
    except CloudImportError as e:
        db.session.rollback()
        return _error(str(e))
    except Exception as e:  # leave the database empty so the import can be retried
        db.session.rollback()
        current_app.logger.exception("Cloud import failed")
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()
        return _error(f"Import failed: {str(e).splitlines()[0][:200]}", 500)
    return jsonify(summary)


# ------------------------------- backups ------------------------------------


@system_bp.route("/info", methods=["GET"])
@jwt_required()
@admin_required()
@desktop_only
def info():
    try:
        backups = backup.list_backups()
    except backup.BackupError:
        backups = []
    return jsonify({
        "data_dir": current_app.config.get("DATA_DIR"),
        "upload_dir": current_app.config.get("UPLOAD_FOLDER"),
        "backup_folder": AppSetting.get("backup_folder", ""),
        "backups": backups,
        "version": current_app.config.get("APP_VERSION"),
    })


@system_bp.route("/backups", methods=["POST"])
@jwt_required()
@admin_required()
@desktop_only
def create_backup():
    try:
        name = backup.make_backup(reason="manual")
    except (backup.BackupError, OSError) as e:
        return _error(f"Backup failed: {e}", 500)
    return jsonify({"name": name, "backups": backup.list_backups()}), 201


@system_bp.route("/backups/<name>", methods=["GET"])
@jwt_required()
@admin_required()
@desktop_only
def download_backup(name):
    try:
        path = backup.backup_path(name)
    except backup.BackupError as e:
        return _error(str(e), 404)
    return send_file(path, as_attachment=True, download_name=name, mimetype="application/zip")


@system_bp.route("/backup-folder", methods=["PUT"])
@jwt_required()
@admin_required()
@desktop_only
def set_backup_folder():
    folder = ((request.get_json() or {}).get("path") or "").strip()
    if folder and not os.path.isdir(folder):
        return _error("That folder does not exist on this computer")
    AppSetting.set("backup_folder", folder)
    return jsonify({"backup_folder": folder})


@system_bp.route("/restore", methods=["POST"])
@jwt_required()
@admin_required()
@desktop_only
def restore():
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return _error("Choose a backup file (.zip)")
    try:
        result = backup.stage_restore(upload)
    except backup.BackupError as e:
        return _error(str(e))
    return jsonify({"message": "Close and reopen the app to finish restoring", **result})


@system_bp.route("/open-folder", methods=["POST"])
@jwt_required()
@admin_required()
@desktop_only
def open_folder():
    which = (request.get_json() or {}).get("which", "backups")
    folder = {
        "backups": current_app.config["BACKUP_DIR"],
        "uploads": current_app.config["UPLOAD_FOLDER"],
    }.get(which, current_app.config["DATA_DIR"])
    os.makedirs(folder, exist_ok=True)
    if sys.platform.startswith("win"):
        os.startfile(folder)  # noqa: S606 - local desktop app, path from config
    return jsonify({"path": folder})
