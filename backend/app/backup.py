"""Backups for the desktop app.

A backup is one .zip file holding a consistent copy of the SQLite database
(``zwe_pos.db``), the uploaded files (``uploads/``: investigation reports
and scans) and a small ``manifest.json``.

Restoring never overwrites the open database: the chosen file is checked and
staged as ``restore_pending.zip``, and the launcher applies it the next time
the app starts (after saving a safety backup of the current data).
"""
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timedelta

from flask import current_app


DB_NAME = "zwe_pos.db"
PENDING_NAME = "restore_pending.zip"
KEEP_BACKUPS = 30


class BackupError(Exception):
    pass


def _db_path():
    from app.models import db

    path = db.engine.url.database
    if db.engine.dialect.name != "sqlite" or not path:
        raise BackupError("Backups are only available in the desktop app")
    return os.path.abspath(path)


def backup_dir():
    folder = current_app.config.get("BACKUP_DIR")
    if not folder:
        raise BackupError("Backups are only available in the desktop app")
    os.makedirs(folder, exist_ok=True)
    return folder


def _write_zip(target, db_file, upload_dir, reason):
    """Write a backup zip to `target` from a database file and an uploads folder."""
    tmp = target + ".part"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(db_file, DB_NAME)
        if upload_dir and os.path.isdir(upload_dir):
            for root, _dirs, files in os.walk(upload_dir):
                for name in files:
                    full = os.path.join(root, name)
                    rel = os.path.relpath(full, upload_dir).replace(os.sep, "/")
                    zf.write(full, f"uploads/{rel}")
        zf.writestr("manifest.json", json.dumps({
            "app": "Zwe POS",
            "created_at": datetime.now().isoformat(),
            "reason": reason,
        }))
    os.replace(tmp, target)


def make_backup(reason="manual"):
    """Create a backup now. Returns its file name."""
    src = _db_path()
    folder = backup_dir()
    name = f"zwe-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    target = os.path.join(folder, name)

    # sqlite3's backup API copies a consistent snapshot even while the app runs
    fd, snapshot = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        source, dest = sqlite3.connect(src), sqlite3.connect(snapshot)
        try:
            source.backup(dest)
        finally:
            dest.close()
            source.close()
        _write_zip(target, snapshot, current_app.config.get("UPLOAD_FOLDER"), reason)
    finally:
        os.remove(snapshot)

    _copy_to_extra_folder(target)
    _prune(folder)
    return name


def _copy_to_extra_folder(path):
    """Also copy to the folder chosen in Settings (USB drive, Google Drive folder...)."""
    from app.models import AppSetting

    extra = (AppSetting.get("backup_folder", "") or "").strip()
    if not extra:
        return
    try:
        if os.path.isdir(extra):
            shutil.copy2(path, os.path.join(extra, os.path.basename(path)))
    except OSError as e:
        current_app.logger.warning("Could not copy backup to %s: %s", extra, e)


def _prune(folder):
    files = sorted(f for f in os.listdir(folder) if f.startswith("zwe-backup-") and f.endswith(".zip"))
    for old in files[:-KEEP_BACKUPS]:
        try:
            os.remove(os.path.join(folder, old))
        except OSError:
            pass


def list_backups():
    folder = backup_dir()
    rows = []
    for name in sorted(os.listdir(folder), reverse=True):
        if not (name.startswith("zwe-backup-") or name.startswith("before-restore-")) or not name.endswith(".zip"):
            continue
        full = os.path.join(folder, name)
        rows.append({
            "name": name,
            "size": os.path.getsize(full),
            "created_at": datetime.fromtimestamp(os.path.getmtime(full)).isoformat(),
        })
    return rows


def backup_path(name):
    """Full path of a backup file, refusing anything outside the backup folder."""
    folder = os.path.abspath(backup_dir())
    path = os.path.abspath(os.path.join(folder, name))
    if os.path.dirname(path) != folder or not os.path.isfile(path):
        raise BackupError("Backup not found")
    return path


def auto_backup_if_due(hours=24):
    """Make an automatic backup when the newest one is older than `hours`."""
    folder = backup_dir()
    files = [os.path.join(folder, f) for f in os.listdir(folder) if f.startswith("zwe-backup-")]
    if files:
        newest = max(os.path.getmtime(f) for f in files)
        if datetime.now() - datetime.fromtimestamp(newest) < timedelta(hours=hours):
            return None
    return make_backup(reason="automatic")


def validate_backup(path):
    """Check that a file is a Zwe POS backup with a usable database."""
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            if DB_NAME not in names:
                raise BackupError("This file is not a Zwe POS backup")
            for n in names:
                if n.startswith("/") or ".." in n.split("/"):
                    raise BackupError("This backup file is damaged")
            fd, tmp = tempfile.mkstemp(suffix=".db")
            os.close(fd)
            try:
                with open(tmp, "wb") as out:
                    out.write(zf.read(DB_NAME))
                con = sqlite3.connect(tmp)
                try:
                    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                    if not {"users", "medicines", "sales"} <= tables:
                        raise BackupError("This backup file has no pharmacy data")
                    users = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                except sqlite3.DatabaseError as e:
                    raise BackupError("This backup file is damaged") from e
                finally:
                    con.close()
            finally:
                os.remove(tmp)
    except zipfile.BadZipFile as e:
        raise BackupError("This file is not a Zwe POS backup") from e
    return {"users": users}


def stage_restore(upload):
    """Save an uploaded backup to be restored on the next start."""
    data_dir = current_app.config["DATA_DIR"]
    target = os.path.join(data_dir, PENDING_NAME)
    tmp = target + ".part"
    upload.save(tmp)
    try:
        info = validate_backup(tmp)
    except BackupError:
        os.remove(tmp)
        raise
    os.replace(tmp, target)
    return info


def apply_pending_restore(data_dir, db_file, upload_dir, log=print):
    """Called by the launcher BEFORE the app opens the database."""
    pending = os.path.join(data_dir, PENDING_NAME)
    if not os.path.exists(pending):
        return False
    try:
        validate_backup(pending)
    except BackupError as e:
        log(f"Restore skipped: {e}")
        os.replace(pending, pending + ".rejected")
        return False

    # Safety copy of the current data first
    folder = os.path.join(data_dir, "backups")
    os.makedirs(folder, exist_ok=True)
    if os.path.exists(db_file):
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        _write_zip(os.path.join(folder, f"before-restore-{stamp}.zip"), db_file, upload_dir, "before restore")

    with zipfile.ZipFile(pending) as zf:
        with open(db_file + ".restoring", "wb") as out:
            out.write(zf.read(DB_NAME))
        os.replace(db_file + ".restoring", db_file)
        for suffix in ("-wal", "-shm", "-journal"):
            if os.path.exists(db_file + suffix):
                os.remove(db_file + suffix)
        if upload_dir:
            if os.path.isdir(upload_dir):
                shutil.rmtree(upload_dir)
            os.makedirs(upload_dir, exist_ok=True)
            for n in zf.namelist():
                if n.startswith("uploads/") and not n.endswith("/"):
                    dest = os.path.join(upload_dir, *n[len("uploads/"):].split("/"))
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, "wb") as out:
                        out.write(zf.read(n))
    os.remove(pending)
    log("Backup restored")
    return True
