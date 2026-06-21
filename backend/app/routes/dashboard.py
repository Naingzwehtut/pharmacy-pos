from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.models import Medicine, Sale, SaleItem, db
from app.utils import admin_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
@admin_required()
def dashboard():
    warning_days = current_app.config["EXPIRY_WARNING_DAYS"]
    today = date.today()
    warning_cutoff = today + timedelta(days=warning_days)

    total_sales = db.session.query(func.count(Sale.id)).scalar() or 0
    total_revenue = float(
        db.session.query(func.coalesce(func.sum(Sale.total_amount), 0)).scalar()
    )
    total_profit = float(
        db.session.query(func.coalesce(func.sum(Sale.total_profit), 0)).scalar()
    )

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

    recent_sales = Sale.query.order_by(Sale.created_at.desc()).limit(10).all()

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
                "total_sales": total_sales,
                "total_revenue": total_revenue,
                "total_profit": total_profit,
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
