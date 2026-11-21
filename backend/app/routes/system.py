"""Desktop app: first-run setup, moving data from the cloud, backups."""
import os
import sys
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import create_access_token, jwt_required

from app import backup
from app.cloud_import import CloudImportError, import_from_cloud
from app.models import AppSetting, User, db
from app.routes.auth import MIN_PASSWORD_LENGTH
from app.utils import admin_required, clean_text, error

system_bp = Blueprint("system", __name__)


def desktop_only(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_app.config.get("DESKTOP"):
            return error("Only available in the desktop app", 404)
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
    """First run: create the owner (admin) account. Only while there are no users."""
    if not _needs_setup():
        return error("Setup is already done", 409)
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or " " in username:
        return error("Choose a username without spaces")
    if len(password) < MIN_PASSWORD_LENGTH:
        return error(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    user = User(username=username, role="admin", full_name=clean_text(data.get("full_name"), 200))
    user.set_password(password)
    db.session.add(user)
    for key in ("pharmacy_name", "pharmacy_name_mm", "pharmacy_address", "pharmacy_phone"):
        value = clean_text(data.get(key), 255)
        if value:
            AppSetting.set(key, value, commit=False)
    db.session.commit()
    token = create_access_token(identity=str(user.id), additional_claims={"role": "admin", "username": user.username})
    return jsonify({"access_token": token, "user": user.to_dict()}), 201


@system_bp.route("/import-cloud", methods=["POST"])
@desktop_only
def import_cloud():
    """First run: copy everything from the cloud (Supabase) database to this computer."""
    if not _needs_setup():
        return error("This computer already has data", 409)
    data = request.get_json() or {}
    try:
        summary = import_from_cloud(
            data.get("database_url"),
            supabase_url=clean_text(data.get("supabase_url")),
            supabase_key=clean_text(data.get("supabase_key")),
            bucket=clean_text(data.get("bucket")) or "investigations",
            log=current_app.logger.info,
        )
    except CloudImportError as e:
        db.session.rollback()
        return error(str(e))
    except Exception as e:  # keep the database empty so the import can be retried
        db.session.rollback()
        current_app.logger.exception("Cloud import failed")
        _wipe_local()
        return error(f"Import failed: {str(e).splitlines()[0][:200]}", 500)
    return jsonify(summary)


def _wipe_local():
    for table in reversed(db.metadata.sorted_tables):
        db.session.execute(table.delete())
    db.session.commit()


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
        "backup_dir": current_app.config.get("BACKUP_DIR"),
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
        return error(f"Backup failed: {e}", 500)
    return jsonify({"name": name, "backups": backup.list_backups()}), 201


@system_bp.route("/backups/<name>", methods=["GET"])
@jwt_required()
@admin_required()
@desktop_only
def download_backup(name):
    try:
        path = backup.backup_path(name)
    except backup.BackupError as e:
        return error(str(e), 404)
    return send_file(path, as_attachment=True, download_name=name, mimetype="application/zip")


@system_bp.route("/backup-folder", methods=["PUT"])
@jwt_required()
@admin_required()
@desktop_only
def set_backup_folder():
    folder = ((request.get_json() or {}).get("path") or "").strip()
    if folder and not os.path.isdir(folder):
        return error("That folder does not exist on this computer")
    AppSetting.set("backup_folder", folder)
    return jsonify({"backup_folder": folder})


@system_bp.route("/restore", methods=["POST"])
@jwt_required()
@admin_required()
@desktop_only
def restore():
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return error("Choose a backup file (.zip)")
    try:
        info_ = backup.stage_restore(upload)
    except backup.BackupError as e:
        return error(str(e))
    return jsonify({"message": "Restart Zwe Pharmacy to finish restoring", **info_})


@system_bp.route("/open-folder", methods=["POST"])
@jwt_required()
@admin_required()
@desktop_only
def open_folder():
    which = (request.get_json() or {}).get("which", "backups")
    folder = current_app.config["BACKUP_DIR"] if which == "backups" else current_app.config["DATA_DIR"]
    os.makedirs(folder, exist_ok=True)
    if sys.platform.startswith("win"):
        os.startfile(folder)  # noqa: S606 - local desktop app, path from config
    return jsonify({"path": folder})
