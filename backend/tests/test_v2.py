from datetime import timedelta

from app import inventory
from app.models import Medicine, MedicineBatch, db
from app.timeutil import local_today
from tests.conftest import login


def stock(medicine_id):
    return db.session.get(Medicine, medicine_id).stock_quantity


def batches():
    return {b.batch_number: b.quantity for b in MedicineBatch.query.all()}


def test_health(client):
    assert client.get("/api/health").json["version"] == "2.0.0"


def test_checkout_fefo_units_and_change(client, cashier, medicine):
    res = client.post("/api/sales/checkout", headers=cashier, json={
        "items": [{"medicine_id": medicine, "quantity": 1, "unit": "strip"}],
        "payment_method": "cash", "amount_tendered": 1000,
    })
    assert res.status_code == 201, res.json
    sale = res.json
    assert sale["total_amount"] == 500
    assert sale["change_given"] == 500
    item = sale["items"][0]
    assert item["quantity"] == 10 and item["unit_qty"] == 1 and item["unit_label"] == "strip"
    assert "cost_price" not in item  # hidden from cashiers
    # FEFO: 5 from batch A (expires first), then 5 from batch B
    assert batches() == {"A": 0, "B": 95}
    assert stock(medicine) == 95


def test_profit_uses_batch_costs(client, admin, medicine):
    res = client.post("/api/sales/checkout", headers=admin, json={
        "items": [{"medicine_id": medicine, "quantity": 10}], "payment_method": "kbzpay",
        "payment_reference": "TX1",
    })
    assert res.status_code == 201
    # cost = 5*30 + 5*40 = 350, revenue = 10*60 = 600
    assert res.json["total_cost"] == 350
    assert res.json["total_profit"] == 250
    assert res.json["payment_reference"] == "TX1"


def test_expired_batch_not_sold(client, admin, app):
    m = Medicine(name="Old", category="X", selling_price=10, cost_price=5, stock_quantity=0)
    db.session.add(m)
    db.session.flush()
    inventory.add_batch(m, 10, local_today() - timedelta(days=1), 5)
    db.session.commit()
    res = client.post("/api/sales/checkout", headers=admin, json={"items": [{"medicine_id": m.id, "quantity": 1}]})
    assert res.status_code == 400
    assert "expired" in res.json["error"]


def test_insufficient_stock_saves_nothing(client, admin, medicine):
    res = client.post("/api/sales/checkout", headers=admin, json={
        "items": [{"medicine_id": medicine, "quantity": 2, "unit": "box"}],
    })
    assert res.status_code == 400
    assert stock(medicine) == 105


def test_cashier_discount_limit(client, cashier, admin, medicine):
    big = {"items": [{"medicine_id": medicine, "quantity": 1, "unit": "box"}], "discount": 1000}
    assert client.post("/api/sales/checkout", headers=cashier, json=big).status_code == 403
    assert stock(medicine) == 105
    res = client.post("/api/sales/checkout", headers=admin, json=big)
    assert res.status_code == 201 and res.json["total_amount"] == 3500


def test_credit_sale_limit_and_repayment(client, cashier, medicine, patient):
    box = [{"medicine_id": medicine, "quantity": 1, "unit": "box"}]
    res = client.post("/api/sales/checkout", headers=cashier, json={"items": box, "payment_method": "credit"})
    assert res.status_code == 400  # credit needs a registered customer
    res = client.post("/api/sales/checkout", headers=cashier, json={
        "items": box, "payment_method": "credit", "patient_id": patient, "amount_paid": 500})
    assert res.status_code == 201, res.json
    assert res.json["balance_due"] == 4000
    # 4,000 owed + 6,500 more would pass the 10,000 limit
    inventory.add_batch(db.session.get(Medicine, medicine), 200, local_today() + timedelta(days=99), 40)
    db.session.commit()
    res = client.post("/api/sales/checkout", headers=cashier, json={
        "items": [{"medicine_id": medicine, "quantity": 13, "unit": "strip"}],
        "payment_method": "credit", "patient_id": patient})
    assert res.status_code == 400 and "limit" in res.json["error"]
    res = client.post(f"/api/credit/accounts/{patient}/payments", headers=cashier,
                      json={"amount": 1500, "payment_method": "wavepay"})
    assert res.status_code == 201 and res.json["balance"] == 2500
    accounts = client.get("/api/credit/accounts", headers=cashier).json
    assert accounts["total_outstanding"] == 2500
    st = client.get(f"/api/credit/accounts/{patient}", headers=cashier).json
    assert [e["balance"] for e in st["entries"]] == [4000, 2500]
    report = client.get("/api/reports/daily", headers=cashier).json
    assert report["credit_given"] == 4000 and report["credit_repaid"] == 1500
    assert report["cash_in_drawer"] == 500


def test_void_restores_batches(client, admin, cashier, medicine):
    sale = client.post("/api/sales/checkout", headers=cashier, json={
        "items": [{"medicine_id": medicine, "quantity": 1, "unit": "strip"}]}).json
    assert client.post(f"/api/sales/{sale['id']}/void", headers=cashier, json={"reason": "x"}).status_code == 403
    assert client.post(f"/api/sales/{sale['id']}/void", headers=admin, json={}).status_code == 400
    res = client.post(f"/api/sales/{sale['id']}/void", headers=admin, json={"reason": "Wrong item"})
    assert res.status_code == 200 and res.json["status"] == "voided"
    assert batches() == {"A": 5, "B": 100}
    report = client.get("/api/reports/daily", headers=admin).json
    assert report["sales_count"] == 0 and report["voided_count"] == 1
    assert client.post(f"/api/sales/{sale['id']}/void", headers=admin, json={"reason": "again"}).status_code == 409


def test_purchase_creates_batches(client, pharmacist, medicine):
    sup = client.post("/api/suppliers", headers=pharmacist, json={"name": "Mega"}).json
    res = client.post("/api/purchases", headers=pharmacist, json={
        "supplier_id": sup["id"], "invoice_number": "INV-1",
        "items": [{"medicine_id": medicine, "quantity": 2, "unit": "box", "unit_cost": 3800,
                   "batch_number": "C", "expiry_date": (local_today() + timedelta(days=500)).isoformat()}],
    })
    assert res.status_code == 201, res.json
    assert res.json["total_cost"] == 7600
    assert stock(medicine) == 305
    batch = MedicineBatch.query.filter_by(batch_number="C").one()
    assert float(batch.cost_price) == 38
    expired = client.post("/api/purchases", headers=pharmacist, json={
        "items": [{"medicine_id": medicine, "quantity": 1, "unit_cost": 1,
                   "expiry_date": (local_today() - timedelta(days=1)).isoformat()}]})
    assert expired.status_code == 400


def test_cashier_cannot_manage_stock(client, cashier, medicine):
    assert client.post("/api/purchases", headers=cashier, json={"items": []}).status_code == 403
    assert client.post(f"/api/medicines/{medicine}/adjust", headers=cashier, json={}).status_code == 403
    m = client.get("/api/medicines", headers=cashier).json[0]
    assert "cost_price" not in m


def test_adjustment_and_audit(client, pharmacist, medicine):
    res = client.post(f"/api/medicines/{medicine}/adjust", headers=pharmacist,
                      json={"change": -3, "reason": "damaged", "note": "dropped"})
    assert res.status_code == 200, res.json
    assert res.json["stock_quantity"] == 102
    moves = client.get(f"/api/medicines/movements?medicine_id={medicine}", headers=pharmacist).json
    assert moves[0]["change"] == -3 and moves[0]["reason"] == "adjust:damaged"
    bad = client.post(f"/api/medicines/{medicine}/adjust", headers=pharmacist, json={"change": 5, "reason": "count"})
    assert bad.status_code == 400  # adding stock needs an expiry date


def test_create_medicine_with_opening_stock(client, pharmacist):
    res = client.post("/api/medicines", headers=pharmacist, json={
        "name": "ORS", "category": "Digestive", "selling_price": 200, "cost_price": 120,
        "unit_name": "sachet", "box_size": 50, "box_price": 9000, "barcode": "123",
        "name_mm": "ဓာတ်ဆားရည်",
        "stock_quantity": 50, "expiry_date": (local_today() + timedelta(days=200)).isoformat(),
    })
    assert res.status_code == 201, res.json
    assert res.json["stock_quantity"] == 50
    assert [o["unit"] for o in res.json["pack_options"]] == ["unit", "box"]
    assert client.get("/api/medicines/barcode/123", headers=pharmacist).json["name"] == "ORS"
    assert client.get("/api/medicines?search=ဓာတ်ဆား", headers=pharmacist).json[0]["name"] == "ORS"
    dup = client.post("/api/medicines", headers=pharmacist, json={
        "name": "X", "category": "Y", "selling_price": 1, "barcode": "123"})
    assert dup.status_code == 400


def test_users_and_deactivation(client, admin):
    res = client.post("/api/users", headers=admin, json={"username": "new", "password": "secret123", "role": "cashier"})
    assert res.status_code == 201
    token = login(client, "new")
    assert client.get("/api/auth/me", headers=token).status_code == 200
    client.put(f"/api/users/{res.json['id']}", headers=admin, json={"is_active": False})
    assert client.get("/api/auth/me", headers=token).status_code == 401
    me = client.get("/api/auth/me", headers=admin).json
    assert client.put(f"/api/users/{me['id']}", headers=admin, json={"role": "cashier"}).status_code == 400
    res = client.post("/api/auth/change-password", headers=admin,
                      json={"current_password": "secret123", "new_password": "newpass1"})
    assert res.status_code == 200


def test_settings_pagination_and_export(client, admin, cashier, medicine):
    assert client.put("/api/settings", headers=cashier, json={"currency_label": "K"}).status_code == 403
    res = client.put("/api/settings", headers=admin, json={"receipt_myanmar_digits": True, "currency_label": "ကျပ်"})
    assert res.json["receipt_myanmar_digits"] is True and res.json["currency_label"] == "ကျပ်"
    for _ in range(3):
        client.post("/api/sales/checkout", headers=cashier, json={"items": [{"medicine_id": medicine, "quantity": 1}]})
    page = client.get("/api/sales?page=1&per_page=2", headers=admin).json
    assert page["total"] == 3 and page["pages"] == 2 and len(page["items"]) == 2
    today = local_today().isoformat()
    assert len(client.get(f"/api/sales?start_date={today}&end_date={today}", headers=admin).json) == 3
    csv = client.get("/api/sales/export.csv", headers=admin)
    assert csv.status_code == 200 and b"Paracetamol" in csv.data


def test_dashboard_and_reports(client, admin, pharmacist, medicine):
    client.post("/api/sales/checkout", headers=admin, json={"items": [{"medicine_id": medicine, "quantity": 2}]})
    d = client.get("/api/dashboard", headers=admin).json
    assert d["today"]["sales"] == 1 and d["today"]["revenue"] == 120
    assert len(d["sales_by_day"]) == 14 and d["sales_by_day"][-1]["revenue"] == 120
    assert d["expiring_soon"][0]["batch_number"] == "A"
    exp = client.get("/api/reports/expiry?days=30", headers=pharmacist).json
    assert len(exp["expiring"]) == 1
    today = local_today()
    cal = client.get(f"/api/dashboard/calendar?year={today.year}&month={today.month}", headers=admin).json
    assert cal[today.isoformat()]["total_revenue"] == 120
