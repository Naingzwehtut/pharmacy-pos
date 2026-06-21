from datetime import date, datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # admin | cashier
    created_at = db.Column(db.DateTime, default=utcnow)

    sales = db.relationship("Sale", backref="cashier", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
        }


class Medicine(db.Model):
    __tablename__ = "medicines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    category = db.Column(db.String(100), nullable=False)
    stock_quantity = db.Column(db.Integer, nullable=False, default=0)
    cost_price = db.Column(db.Numeric(10, 2), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)
    expiry_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    sale_items = db.relationship("SaleItem", backref="medicine", lazy=True)

    @property
    def is_expired(self):
        return self.expiry_date < date.today()

    def to_dict(self, warning_days=30):
        days_to_expiry = (self.expiry_date - date.today()).days
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "stock_quantity": self.stock_quantity,
            "cost_price": float(self.cost_price),
            "selling_price": float(self.selling_price),
            "expiry_date": self.expiry_date.isoformat(),
            "is_expired": self.is_expired,
            "days_to_expiry": days_to_expiry,
            "expiry_status": (
                "expired"
                if days_to_expiry < 0
                else "warning"
                if days_to_expiry <= warning_days
                else "ok"
            ),
            "profit_per_unit": float(self.selling_price) - float(self.cost_price),
        }


class Sale(db.Model):
    __tablename__ = "sales"

    id = db.Column(db.Integer, primary_key=True)
    sale_number = db.Column(db.String(30), unique=True, nullable=False)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    total_cost = db.Column(db.Numeric(10, 2), nullable=False)
    total_profit = db.Column(db.Numeric(10, 2), nullable=False)
    cashier_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    items = db.relationship(
        "SaleItem", backref="sale", lazy=True, cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sale_number": self.sale_number,
            "total_amount": float(self.total_amount),
            "total_cost": float(self.total_cost),
            "total_profit": float(self.total_profit),
            "cashier_id": self.cashier_id,
            "cashier_name": self.cashier.username if self.cashier else None,
            "created_at": self.created_at.isoformat(),
            "items": [item.to_dict() for item in self.items],
        }


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False)
    medicine_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    cost_price = db.Column(db.Numeric(10, 2), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)
    line_total = db.Column(db.Numeric(10, 2), nullable=False)
    line_profit = db.Column(db.Numeric(10, 2), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine_name,
            "quantity": self.quantity,
            "cost_price": float(self.cost_price),
            "selling_price": float(self.selling_price),
            "line_total": float(self.line_total),
            "line_profit": float(self.line_profit),
        }
