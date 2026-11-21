"""Daily closing (end-of-day cash count) and expiry reports."""
from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import joinedload, selectinload

from app.models import CreditPayment, Medicine, MedicineBatch, Sale
from app.timeutil import local_day_bounds, local_today, parse_date
from app.utils import current_role, current_user_id, error, role_required

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/daily", methods=["GET"])
@jwt_required()
def daily_closing():
    """Totals for one local day (or a range). Cashiers see only their own sales."""
    try:
        start = parse_date(request.args.get("date") or request.args.get("start_date")) or local_today()
        end = parse_date(request.args.get("end_date")) or start
    except ValueError:
        return error("Invalid date")
    if end < start:
        return error("End date is before start date")
    lo, hi = local_day_bounds(start, end)

    role = current_role()
    cashier_id = request.args.get("cashier_id", type=int)
    if role == "cashier":
        cashier_id = current_user_id()

    sq = Sale.query.options(selectinload(Sale.items), joinedload(Sale.cashier)).filter(
        Sale.created_at >= lo, Sale.created_at < hi
    )
    pq = CreditPayment.query.filter(CreditPayment.created_at >= lo, CreditPayment.created_at < hi)
    if cashier_id:
        sq = sq.filter(Sale.cashier_id == cashier_id)
        pq = pq.filter(CreditPayment.received_by == cashier_id)
    sales = sq.all()
    payments = pq.all()

    done = [s for s in sales if s.status != "voided"]
    voided = [s for s in sales if s.status == "voided"]

    methods = {}

    def bucket(method):
        return methods.setdefault(method or "cash", {"method": method or "cash", "sales": 0, "sales_amount": 0.0,
                                                     "repayments": 0.0, "collected": 0.0})

    for s in done:
        b = bucket(s.payment_method)
        b["sales"] += 1
        b["sales_amount"] += float(s.total_amount)
        if s.payment_method == "credit":
            # Part paid at the till on a credit sale was cash in the drawer
            if s.paid > 0:
                bucket("cash")["collected"] += s.paid
        else:
            b["collected"] += s.paid
    for p in payments:
        b = bucket(p.payment_method)
        b["repayments"] += float(p.amount)
        b["collected"] += float(p.amount)

    cashiers = {}
    for s in done:
        name = s.cashier.username if s.cashier else "?"
        c = cashiers.setdefault(name, {"cashier": name, "sales": 0, "amount": 0.0})
        c["sales"] += 1
        c["amount"] += float(s.total_amount)

    items = {}
    for s in done:
        for i in s.items:
            row = items.setdefault(i.medicine_name, {"name": i.medicine_name, "quantity": 0, "amount": 0.0})
            row["quantity"] += i.quantity
            row["amount"] += float(i.line_total)

    result = {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "sales_count": len(done),
        "gross_sales": round(sum(float(s.subtotal) + float(s.doctor_fee or 0) + float(s.delivery_fee or 0) for s in done), 2),
        "medicine_sales": round(sum(float(s.subtotal) for s in done), 2),
        "doctor_fees": round(sum(float(s.doctor_fee or 0) for s in done), 2),
        "delivery_fees": round(sum(float(s.delivery_fee or 0) for s in done), 2),
        "discounts": round(sum(float(s.discount or 0) for s in done), 2),
        "net_sales": round(sum(float(s.total_amount) for s in done), 2),
        "credit_given": round(sum(s.balance_due for s in done), 2),
        "credit_repaid": round(sum(float(p.amount) for p in payments), 2),
        "cash_in_drawer": round(methods.get("cash", {}).get("collected", 0.0), 2),
        "total_collected": round(sum(m["collected"] for m in methods.values()), 2),
        "voided_count": len(voided),
        "voided_amount": round(sum(float(s.total_amount) for s in voided), 2),
        "payment_methods": sorted(methods.values(), key=lambda m: -m["collected"]),
        "by_cashier": sorted(cashiers.values(), key=lambda c: -c["amount"]),
        "top_items": sorted(items.values(), key=lambda r: -r["amount"])[:15],
    }
    if role == "admin":
        result["cost"] = round(sum(float(s.total_cost) for s in done), 2)
        result["profit"] = round(sum(float(s.total_profit) for s in done), 2)
    return jsonify(result)


@reports_bp.route("/expiry", methods=["GET"])
@jwt_required()
@role_required("admin", "pharmacist")
def expiry_report():
    """Batches in stock that are expired or expire within `days` (default 90)."""
    days = min(max(request.args.get("days", 90, type=int), 1), 730)
    today = local_today()
    cutoff = today + timedelta(days=days)
    warning_days = current_app.config["EXPIRY_WARNING_DAYS"]
    rows = (
        MedicineBatch.query.join(Medicine)
        .filter(MedicineBatch.quantity > 0, MedicineBatch.expiry_date <= cutoff)
        .order_by(MedicineBatch.expiry_date, Medicine.name)
        .all()
    )
    batches = [b.to_dict(warning_days) for b in rows]
    for b, row in zip(batches, rows):
        b["unit_name"] = row.medicine.unit_name
        b["shelf_location"] = row.medicine.shelf_location
    expired = [b for b in batches if b["days_to_expiry"] < 0]
    soon = [b for b in batches if b["days_to_expiry"] >= 0]
    return jsonify({
        "days": days,
        "expired": expired,
        "expiring": soon,
        "expired_value": round(sum(b["stock_value"] for b in expired), 2),
        "expiring_value": round(sum(b["stock_value"] for b in soon), 2),
    })
