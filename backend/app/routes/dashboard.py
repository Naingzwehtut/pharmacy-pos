from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from app.models import Medicine, Patient, Sale, SaleItem, db
from app.utils import admin_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
@admin_required()
def dashboard():
    warning_days = current_app.config["EXPIRY_WARNING_DAYS"]
    today = date.today()
    warning_cutoff = today + timedelta(days=warning_days)

    # All summary totals in ONE database round trip (each round trip to a
    # remote database costs tens of milliseconds or more).
    totals = db.session.execute(
        select(
            select(func.count(Sale.id)).scalar_subquery().label("total_sales"),
            select(func.coalesce(func.sum(Sale.total_amount), 0))
            .scalar_subquery()
            .label("total_revenue"),
            select(func.coalesce(func.sum(Sale.total_profit), 0))
            .scalar_subquery()
            .label("total_profit"),
            select(func.coalesce(func.sum(Sale.doctor_fee), 0))
            .scalar_subquery()
            .label("total_doctor_fees"),
            select(
                func.coalesce(func.sum(Medicine.cost_price * Medicine.stock_quantity), 0)
            )
            .scalar_subquery()
            .label("total_expenses"),
            select(func.count(Medicine.id)).scalar_subquery().label("total_products"),
            select(func.count(Patient.id)).scalar_subquery().label("total_patients"),
        )
    ).one()

    best_selling = (
        db.session.query(
            SaleItem.medicine_name,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .group_by(SaleItem.medicine_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(10)
        .all()
    )

    low_stock = (
        Medicine.query.filter(Medicine.stock_quantity <= 10)
        .order_by(Medicine.stock_quantity)
        .limit(20)
        .all()
    )

    expiring_soon = (
        Medicine.query.filter(
            Medicine.expiry_date >= today,
            Medicine.expiry_date <= warning_cutoff,
        )
        .order_by(Medicine.expiry_date)
        .limit(20)
        .all()
    )

    expired = (
        Medicine.query.filter(Medicine.expiry_date < today)
        .order_by(Medicine.expiry_date.desc())
        .limit(20)
        .all()
    )

    # Load items, cashier and patient together instead of 3 queries per sale
    recent_sales = (
        Sale.query.options(
            selectinload(Sale.items),
            joinedload(Sale.cashier),
            joinedload(Sale.patient),
        )
        .order_by(Sale.created_at.desc())
        .limit(10)
        .all()
    )

    sales_by_day = (
        db.session.query(
            func.date(Sale.created_at).label("day"),
            func.count(Sale.id).label("count"),
            func.sum(Sale.total_amount).label("revenue"),
            func.sum(Sale.total_profit).label("profit"),
        )
        .group_by(func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at).desc())
        .limit(14)
        .all()
    )

    return jsonify(
        {
            "summary": {
                "total_sales": totals.total_sales or 0,
                "total_revenue": float(totals.total_revenue),
                "total_profit": float(totals.total_profit),
                "total_expenses": float(totals.total_expenses),
                "total_products": totals.total_products or 0,
                "total_patients": totals.total_patients or 0,
                "total_doctor_fees": float(totals.total_doctor_fees),
            },
            "best_selling": [
                {
                    "name": row.medicine_name,
                    "quantity_sold": int(row.total_qty),
                    "revenue": float(row.revenue),
                }
                for row in best_selling
            ],
            "low_stock": [m.to_dict(warning_days) for m in low_stock],
            "expiring_soon": [m.to_dict(warning_days) for m in expiring_soon],
            "expired": [m.to_dict(warning_days) for m in expired],
            "recent_sales": [s.to_dict() for s in recent_sales],
            "sales_by_day": [
                {
                    "date": str(row.day),
                    "count": row.count,
                    "revenue": float(row.revenue or 0),
                    "profit": float(row.profit or 0),
                }
                for row in reversed(sales_by_day)
            ],
        }
    )


@dashboard_bp.route("/calendar", methods=["GET"])
@jwt_required()
@admin_required()
def dashboard_calendar():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)

    if not year or not month or month < 1 or month > 12:
        return jsonify({"error": "year and month query params are required"}), 400

    # Compare created_at to a plain range (not DATE(created_at)) so the
    # database can use the index on sales.created_at instead of scanning
    # every sale ever made.
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)

    revenue_rows = (
        db.session.query(
            func.date(Sale.created_at).label("day"),
            func.sum(Sale.total_amount).label("revenue"),
            func.sum(Sale.total_profit).label("profit"),
        )
        .filter(Sale.created_at >= start, Sale.created_at < end)
        .group_by(func.date(Sale.created_at))
        .all()
    )

    # Summed separately (joined to sale_items) so sales with multiple line
    # items don't get their revenue/profit multiplied in the query above.
    items_rows = (
        db.session.query(
            func.date(Sale.created_at).label("day"),
            func.count(SaleItem.id).label("items_sold"),
        )
        .join(SaleItem, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= start, Sale.created_at < end)
        .group_by(func.date(Sale.created_at))
        .all()
    )
    items_by_day = {str(row.day): int(row.items_sold or 0) for row in items_rows}

    return jsonify(
        {
            str(row.day): {
                "total_items_sold": items_by_day.get(str(row.day), 0),
                "total_revenue": float(row.revenue or 0),
                "total_profit": float(row.profit or 0),
            }
            for row in revenue_rows
        }
    )
