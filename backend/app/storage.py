"""File storage for uploaded investigation files.

Production: a PRIVATE Supabase Storage bucket, accessed with the service-role
(secret) key from the backend only. Files are never public; the API streams
them to logged-in users.

Local development: if Supabase is not configured and the app runs on the
local SQLite database, files are written to ``UPLOAD_FOLDER`` instead.
Render's disk is wiped on every deploy, so local storage is refused when a
real database is configured without Supabase Storage.
"""
import os
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app


class StorageError(Exception):
    """Raised when a file cannot be stored, read or deleted."""


class StorageNotConfigured(StorageError):
    pass


def _supabase():
    cfg = current_app.config
    url, key = cfg.get("SUPABASE_URL"), cfg.get("SUPABASE_SERVICE_KEY")
    if url and key:
        return url.rstrip("/"), key, cfg["SUPABASE_BUCKET"]
    return None


def is_configured():
    return _supabase() is not None or current_app.config.get("ALLOW_LOCAL_UPLOADS")


def _object_url(base, bucket, key):
    return f"{base}/storage/v1/object/{bucket}/{urllib.parse.quote(key)}"


def _call(method, url, service_key, data=None, headers=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", service_key)
    # Legacy service_role keys are JWTs and also go in Authorization.
    # The newer "sb_secret_..." keys must only be sent as `apikey`.
    if service_key.startswith("eyJ"):
        req.add_header("Authorization", f"Bearer {service_key}")
    for name, value in (headers or {}).items():
        req.add_header(name, value)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode("utf-8", "replace")
        current_app.logger.error("Supabase Storage %s %s -> %s %s", method, url, e.code, detail)
        raise StorageError(f"File storage error ({e.code})") from e
    except urllib.error.URLError as e:
        current_app.logger.error("Supabase Storage unreachable: %s", e)
        raise StorageError("Could not reach file storage") from e


def _local_path(key):
    root = os.path.abspath(current_app.config["UPLOAD_FOLDER"])
    path = os.path.abspath(os.path.join(root, key))
    if not path.startswith(root + os.sep):
        raise StorageError("Invalid file path")
    return path


def save(key, data, content_type):
    sb = _supabase()
    if sb:
        base, service_key, bucket = sb
        _call(
            "POST",
            _object_url(base, bucket, key),
            service_key,
            data=data,
            headers={"Content-Type": content_type, "x-upsert": "false"},
        )
        return
    if not current_app.config.get("ALLOW_LOCAL_UPLOADS"):
        raise StorageNotConfigured("File storage is not configured on the server")
    path = _local_path(key)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    except OSError as e:
        current_app.logger.error("Could not save upload to %s: %s", path, e)
        raise StorageError("Could not save the file on the server") from e


def load(key):
    sb = _supabase()
    if sb:
        base, service_key, bucket = sb
        return _call("GET", _object_url(base, bucket, key), service_key)
    if not current_app.config.get("ALLOW_LOCAL_UPLOADS"):
        raise StorageNotConfigured("File storage is not configured on the server")
    try:
        with open(_local_path(key), "rb") as f:
            return f.read()
    except FileNotFoundError as e:
        raise StorageError("File not found") from e
    except OSError as e:
        raise StorageError("Could not read the file") from e


def delete(key):
    sb = _supabase()
    if sb:
        base, service_key, bucket = sb
        _call("DELETE", _object_url(base, bucket, key), service_key)
        return
    if not current_app.config.get("ALLOW_LOCAL_UPLOADS"):
        raise StorageNotConfigured("File storage is not configured on the server")
    try:
        os.remove(_local_path(key))
    except FileNotFoundError:
        pass
    except OSError as e:
        raise StorageError("Could not delete the file") from e
