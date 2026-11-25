from calendar import monthrange
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from app.credit import balances
from app.models import Medicine, MedicineBatch, Patient, Sale, SaleItem, db
from app.timeutil import local_date_expr, local_day_bounds, local_today
from app.utils import admin_required

dashboard_bp = Blueprint("dashboard", __name__)


def _completed():
    return Sale.status != "voided"


def _totals(start=None, end=None):
    q = db.session.query(
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_amount), 0),
        func.coalesce(func.sum(Sale.total_profit), 0),
        func.coalesce(func.sum(Sale.doctor_fee), 0),
        func.coalesce(func.sum(Sale.discount), 0),
    ).filter(_completed())
    if start:
        lo, hi = local_day_bounds(start, end)
        q = q.filter(Sale.created_at >= lo, Sale.created_at < hi)
    count, revenue, profit, doctor_fees, discount = q.one()
    return {
        "sales": int(count or 0),
        "revenue": float(revenue),
        "profit": float(profit),
        "doctor_fees": float(doctor_fees),
        "discount": float(discount),
    }


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
@admin_required()
def dashboard():
    warning_days = current_app.config["EXPIRY_WARNING_DAYS"]
    today = local_today()
    month_start = today.replace(day=1)
    warning_cutoff = today + timedelta(days=warning_days)

    all_time = _totals()
    today_totals = _totals(today)
    yesterday_totals = _totals(today - timedelta(days=1))
    month_totals = _totals(month_start, today)

    stock_value = float(
        db.session.query(func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.cost_price), 0))
        .filter(MedicineBatch.quantity > 0, MedicineBatch.expiry_date >= today)
        .scalar()
    )
    expired_value = float(
        db.session.query(func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.cost_price), 0))
        .filter(MedicineBatch.quantity > 0, MedicineBatch.expiry_date < today)
        .scalar()
    )
    total_products = db.session.query(func.count(Medicine.id)).filter(Medicine.is_active.isnot(False)).scalar() or 0
    total_patients = db.session.query(func.count(Patient.id)).scalar() or 0
    outstanding_credit = round(sum(v["balance"] for v in balances().values() if v["balance"] > 0), 2)

    since = today - timedelta(days=29)
    lo, hi = local_day_bounds(since, today)
    best_selling = (
        db.session.query(
            SaleItem.medicine_name,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.line_total).label("revenue"),
            func.sum(SaleItem.line_profit).label("profit"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(_completed(), Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(SaleItem.medicine_name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .limit(10)
        .all()
    )

    low_stock = (
        Medicine.query.options(selectinload(Medicine.batches))
        .filter(Medicine.is_active.isnot(False), Medicine.stock_quantity <= Medicine.reorder_level)
        .order_by(Medicine.stock_quantity)
        .limit(30)
        .all()
    )

    def batch_rows(*conditions, order):
        rows = (
            MedicineBatch.query.join(Medicine)
            .filter(MedicineBatch.quantity > 0, *conditions)
            .order_by(order)
            .limit(30)
            .all()
        )
        return [b.to_dict(warning_days) for b in rows]

    expiring_soon = batch_rows(
        MedicineBatch.expiry_date >= today, MedicineBatch.expiry_date <= warning_cutoff,
        order=MedicineBatch.expiry_date,
    )
    expired = batch_rows(MedicineBatch.expiry_date < today, order=MedicineBatch.expiry_date.desc())

    # Load items, cashier and patient together instead of 3 queries per sale
    recent_sales = (
        Sale.query.options(selectinload(Sale.items), joinedload(Sale.cashier), joinedload(Sale.patient))
        .order_by(Sale.created_at.desc()).limit(10).all()
    )

    start14 = today - timedelta(days=13)
    lo, hi = local_day_bounds(start14, today)
    day = local_date_expr(Sale.created_at)
    rows = (
        db.session.query(
            day.label("day"),
            func.count(Sale.id),
            func.sum(Sale.total_amount),
            func.sum(Sale.total_profit),
        )
        .filter(_completed(), Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(day)
        .all()
    )
    by_day = {str(r[0]): r for r in rows}
    sales_by_day = []
    for i in range(14):
        d = (start14 + timedelta(days=i)).isoformat()
        r = by_day.get(d)
        sales_by_day.append({
            "date": d,
            "count": int(r[1]) if r else 0,
            "revenue": float(r[2] or 0) if r else 0.0,
            "profit": float(r[3] or 0) if r else 0.0,
        })

    method_rows = (
        db.session.query(Sale.payment_method, func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0))
        .filter(_completed(), Sale.created_at >= local_day_bounds(month_start, today)[0])
        .group_by(Sale.payment_method)
        .all()
    )

    return jsonify({
        "summary": {
            # v1 keys (kept for compatibility)
            "total_sales": all_time["sales"],
            "total_revenue": all_time["revenue"],
            "total_profit": all_time["profit"],
            "total_expenses": stock_value,
            "total_products": total_products,
            "total_patients": total_patients,
            "total_doctor_fees": all_time["doctor_fees"],
            # v2
            "stock_value": stock_value,
            "expired_stock_value": expired_value,
            "outstanding_credit": outstanding_credit,
        },
        "today": today_totals,
        "yesterday": yesterday_totals,
        "this_month": month_totals,
        "payment_methods_this_month": [
            {"method": m or "cash", "count": int(c), "amount": float(a)} for m, c, a in method_rows
        ],
        "best_selling": [
            {
                "name": r.medicine_name,
                "quantity_sold": int(r.total_qty or 0),
                "revenue": float(r.revenue or 0),
                "profit": float(r.profit or 0),
            }
            for r in best_selling
        ],
        "low_stock": [m.to_dict(warning_days) for m in low_stock],
        "expiring_soon": expiring_soon,
        "expired": expired,
        "recent_sales": [s.to_dict() for s in recent_sales],
        "sales_by_day": sales_by_day,
    })


@dashboard_bp.route("/calendar", methods=["GET"])
@jwt_required()
@admin_required()
def dashboard_calendar():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month or month < 1 or month > 12:
        return jsonify({"error": "year and month query params are required"}), 400

    start_date = date(year, month, 1)
    end_date = date(year, month, monthrange(year, month)[1])
    lo, hi = local_day_bounds(start_date, end_date)
    day = local_date_expr(Sale.created_at)

    revenue_rows = (
        db.session.query(day.label("day"), func.sum(Sale.total_amount), func.sum(Sale.total_profit), func.count(Sale.id))
        .filter(_completed(), Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(day)
        .all()
    )
    # Summed separately so sales with several lines don't multiply revenue
    items_rows = (
        db.session.query(day.label("day"), func.count(SaleItem.id))
        .join(SaleItem, SaleItem.sale_id == Sale.id)
        .filter(_completed(), Sale.created_at >= lo, Sale.created_at < hi)
        .group_by(day)
        .all()
    )
    items_by_day = {str(r[0]): int(r[1] or 0) for r in items_rows}
    return jsonify({
        str(r[0]): {
            "total_items_sold": items_by_day.get(str(r[0]), 0),
            "total_revenue": float(r[1] or 0),
            "total_profit": float(r[2] or 0),
            "total_sales": int(r[3] or 0),
        }
        for r in revenue_rows
    })
