"""Copy the cloud database (Supabase / PostgreSQL) into the local desktop database.

Everything is copied: users (with their passwords), medicines, patients,
sales, settings and investigation records. Investigation files (blood
reports, scans) are downloaded from Supabase Storage into the local uploads
folder, so after the import every image is stored on this computer.

The cloud database is only READ, never changed.
"""
import os
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app
from sqlalchemy import MetaData, Table, create_engine, inspect, select

from app.models import db

CHUNK = 500


class CloudImportError(Exception):
    pass


def normalize_url(url):
    url = (url or "").strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


def _download(base, key, bucket, storage_key):
    url = f"{base.rstrip('/')}/storage/v1/object/{bucket}/{urllib.parse.quote(storage_key)}"
    req = urllib.request.Request(url)
    req.add_header("apikey", key)
    if key.startswith("eyJ"):
        req.add_header("Authorization", f"Bearer {key}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def import_from_cloud(source_url, supabase_url=None, supabase_key=None, bucket="investigations", log=print):
    """Copy all data from `source_url` into the (empty) local database. Returns a summary."""
    from app.models import User

    if User.query.count() > 0:
        raise CloudImportError("This computer already has data. Import only works on a new installation.")

    url = normalize_url(source_url)
    if not url:
        raise CloudImportError("Enter the cloud database connection string")
    try:
        source = create_engine(url, connect_args={"connect_timeout": 20} if url.startswith("postgresql") else {})
        src_tables = set(inspect(source).get_table_names())
    except Exception as e:  # bad password, wrong host, no internet...
        raise CloudImportError(f"Could not connect to the cloud database: {str(e).splitlines()[0][:200]}") from e
    if "users" not in src_tables or "medicines" not in src_tables:
        raise CloudImportError("That database does not look like a pharmacy-pos database")

    counts = {}
    with source.connect() as src:
        inspector = inspect(source)
        for table in db.metadata.sorted_tables:  # parents before children
            if table.name not in src_tables:
                continue
            src_cols = {c["name"] for c in inspector.get_columns(table.name)}
            cols = [c for c in table.columns if c.name in src_cols]
            src_table = Table(table.name, MetaData(), autoload_with=source)
            result = src.execute(select(*[src_table.c[c.name] for c in cols]))
            total = 0
            while True:
                rows = result.fetchmany(CHUNK)
                if not rows:
                    break
                db.session.execute(table.insert(), [dict(r._mapping) for r in rows])
                total += len(rows)
            counts[table.name] = total
            log(f"  {table.name}: {total}")
    db.session.commit()

    files, file_errors = 0, []
    if supabase_url and supabase_key:
        from app.models import PatientInvestigation
        from app.storage import _local_path

        for (storage_key,) in db.session.query(PatientInvestigation.storage_key).all():
            try:
                data = _download(supabase_url, supabase_key, bucket, storage_key)
                path = _local_path(storage_key)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "wb") as f:
                    f.write(data)
                files += 1
            except (urllib.error.URLError, OSError, ValueError) as e:
                file_errors.append(f"{storage_key}: {e}")
                current_app.logger.warning("Could not download %s: %s", storage_key, e)
        log(f"  files: {files} downloaded, {len(file_errors)} failed")

    return {"tables": counts, "files": files, "file_errors": file_errors[:20]}
