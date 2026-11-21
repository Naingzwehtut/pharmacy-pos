import io
import os
import sqlite3
import zipfile
from datetime import timedelta

import pytest

from app import backup, create_app
from app.models import Medicine, User, db
from app.timeutil import local_today
from tests.conftest import TestConfig

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def desktop(tmp_path):
    data = tmp_path / "data"
    data.mkdir()

    class DesktopConfig(TestConfig):
        DESKTOP = True
        DATA_DIR = str(data)
        BACKUP_DIR = str(data / "backups")
        UPLOAD_FOLDER = str(data / "uploads")
        SQLALCHEMY_DATABASE_URI = "sqlite:///" + str(data / "zwe_pharmacy.db").replace("\\", "/")
        ALLOW_LOCAL_UPLOADS = True

    app = create_app(DesktopConfig)
    with app.app_context():
        db.create_all()
        yield app, app.test_client(), data
        db.session.remove()
        db.engine.dispose()


def owner(client):
    res = client.post("/api/system/setup", json={
        "username": "owner", "password": "secret123", "pharmacy_name": "Zwe Pharmacy"})
    assert res.status_code == 201, res.json
    return {"Authorization": "Bearer " + res.json["access_token"]}


def test_first_run_setup(desktop):
    _app, client, _ = desktop
    assert client.get("/api/system/status").json == {"desktop": True, "needs_setup": True, "version": "2.1.0"}
    assert client.post("/api/system/setup", json={"username": "a b", "password": "secret123"}).status_code == 400
    owner(client)
    assert client.get("/api/system/status").json["needs_setup"] is False
    # second setup refused
    assert client.post("/api/system/setup", json={"username": "x", "password": "secret123"}).status_code == 409


def test_setup_disabled_on_server(client):
    assert client.get("/api/system/status").json["desktop"] is False
    assert client.post("/api/system/setup", json={"username": "x", "password": "secret123"}).status_code == 404


def test_backup_and_restore(desktop):
    app, client, data = desktop
    h = owner(client)
    med = client.post("/api/medicines", headers=h, json={
        "name": "ORS", "category": "Digestive", "selling_price": 200, "stock_quantity": 10,
        "expiry_date": (local_today() + timedelta(days=100)).isoformat()}).json
    client.post(f"/api/medicines/{med['id']}/image", headers=h,
                data={"file": (io.BytesIO(PNG), "ors.png")}, content_type="multipart/form-data")

    res = client.post("/api/system/backups", headers=h)
    assert res.status_code == 201, res.json
    name = res.json["name"]
    with zipfile.ZipFile(data / "backups" / name) as zf:
        names = zf.namelist()
    assert "zwe_pharmacy.db" in names and any(n.startswith("uploads/medicines/") for n in names)
    assert client.get(f"/api/system/backups/{name}", headers=h).status_code == 200
    assert client.get("/api/system/backups/..%2Fzwe_pharmacy.db", headers=h).status_code == 404

    # change data after the backup, then restore it
    client.put(f"/api/medicines/{med['id']}", headers=h, json={"name": "Changed"})
    with open(data / "backups" / name, "rb") as f:
        res = client.post("/api/system/restore", headers=h,
                          data={"file": (io.BytesIO(f.read()), name)}, content_type="multipart/form-data")
    assert res.status_code == 200, res.json
    assert client.post("/api/system/restore", headers=h, data={"file": (io.BytesIO(b"nope"), "x.zip")},
                       content_type="multipart/form-data").status_code == 400

    db.session.remove()
    db.engine.dispose()
    db_file = str(data / "zwe_pharmacy.db")
    assert backup.apply_pending_restore(str(data), db_file, str(data / "uploads"), log=lambda *_: None)
    con = sqlite3.connect(db_file)
    assert con.execute("SELECT name FROM medicines").fetchone()[0] == "ORS"
    con.close()
    assert any(f.startswith("before-restore-") for f in os.listdir(data / "backups"))


def test_auto_backup_once_a_day(desktop):
    _app, client, data = desktop
    owner(client)
    assert backup.auto_backup_if_due() is not None
    assert backup.auto_backup_if_due() is None


def test_drug_photo(desktop):
    _app, client, _ = desktop
    h = owner(client)
    med = client.post("/api/medicines", headers=h, json={"name": "X", "category": "Y", "selling_price": 1}).json
    bad = client.post(f"/api/medicines/{med['id']}/image", headers=h,
                      data={"file": (io.BytesIO(b"GIF89a"), "x.gif")}, content_type="multipart/form-data")
    assert bad.status_code == 400
    res = client.post(f"/api/medicines/{med['id']}/image", headers=h,
                      data={"file": (io.BytesIO(PNG), "x.png")}, content_type="multipart/form-data")
    assert res.status_code == 200 and res.json["has_image"]
    img = client.get(f"/api/medicines/{med['id']}/image")  # no login needed
    assert img.status_code == 200 and img.data == PNG and img.mimetype == "image/png"
    assert client.delete(f"/api/medicines/{med['id']}/image", headers=h).json["has_image"] is False
    assert client.get(f"/api/medicines/{med['id']}/image").status_code == 404


def test_import_from_another_database(desktop, tmp_path):
    """Import copies every table (here from a SQLite file; PostgreSQL works the same way)."""
    _app, client, _ = desktop
    src_file = tmp_path / "cloud.db"

    class SourceConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = "sqlite:///" + str(src_file).replace("\\", "/")

    src_app = create_app(SourceConfig)
    with src_app.app_context():
        db.create_all()
        u = User(username="boss", role="admin")
        u.set_password("cloudpass")
        db.session.add(u)
        db.session.add(Medicine(name="Paracetamol", category="Pain", selling_price=50, cost_price=30,
                                stock_quantity=40, expiry_date=local_today() + timedelta(days=300)))
        db.session.commit()
        db.session.remove()
        db.engine.dispose()

    res = client.post("/api/system/import-cloud", json={"database_url": "sqlite:///" + str(src_file).replace("\\", "/")})
    assert res.status_code == 200, res.json
    assert res.json["tables"]["users"] == 1
    # the cloud password still works, and v1-style stock became a batch
    token = client.post("/api/auth/login", json={"username": "boss", "password": "cloudpass"}).json["access_token"]
    meds = client.get("/api/medicines", headers={"Authorization": "Bearer " + token}).json
    assert meds[0]["stock_quantity"] == 40 and meds[0]["batch_count"] == 1
    # only once
    again = client.post("/api/system/import-cloud", json={"database_url": "sqlite:///x.db"})
    assert again.status_code == 409


def test_import_bad_connection(desktop):
    _app, client, _ = desktop
    res = client.post("/api/system/import-cloud", json={"database_url": "postgresql://u:p@127.0.0.1:1/db"})
    assert res.status_code == 400 and "connect" in res.json["error"]
