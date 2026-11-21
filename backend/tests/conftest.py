import os
import sys
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, inventory  # noqa: E402
from app.models import Medicine, Patient, User, db  # noqa: E402
from app.timeutil import local_today  # noqa: E402
from config import Config  # noqa: E402


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_SECRET_KEY = "test-secret-key-that-is-long-enough-for-hs256"


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        for username, role in (("admin", "admin"), ("pharm", "pharmacist"), ("cash", "cashier")):
            u = User(username=username, role=role)
            u.set_password("secret123")
            db.session.add(u)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username):
    res = client.post("/api/auth/login", json={"username": username, "password": "secret123"})
    assert res.status_code == 200, res.json
    return {"Authorization": "Bearer " + res.json["access_token"]}


@pytest.fixture()
def admin(client):
    return login(client, "admin")


@pytest.fixture()
def cashier(client):
    return login(client, "cash")


@pytest.fixture()
def pharmacist(client):
    return login(client, "pharm")


@pytest.fixture()
def medicine(app):
    """Paracetamol: 10 per strip @ 500, 100 per box @ 4500, unit 60.
    Two batches: 5 expiring in 10 days (cost 30), 100 expiring in 300 days (cost 40)."""
    m = Medicine(name="Paracetamol", category="Pain", selling_price=60, cost_price=40,
                 strip_size=10, strip_price=500, box_size=100, box_price=4500, stock_quantity=0)
    db.session.add(m)
    db.session.flush()
    today = local_today()
    inventory.add_batch(m, 5, today + timedelta(days=10), 30, batch_number="A")
    inventory.add_batch(m, 100, today + timedelta(days=300), 40, batch_number="B")
    db.session.commit()
    return m.id


@pytest.fixture()
def patient(app):
    p = Patient(name="Daw Aye", patient_number="P00001", credit_limit=10000)
    db.session.add(p)
    db.session.commit()
    return p.id
