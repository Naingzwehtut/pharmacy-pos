from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

from app.timeutil import iso_utc, local_today

db = SQLAlchemy()

ROLES = ("admin", "pharmacist", "cashier")

PAYMENT_METHODS = (
    "cash",
    "kbzpay",
    "wavepay",
    "ayapay",
    "cbpay",
    "uabpay",
    "mpu_card",
    "bank_transfer",
    "credit",
)


def utcnow():
    return datetime.now(timezone.utc)


def _f(value):
    return float(value or 0)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # admin | pharmacist | cashier
    full_name = db.Column(db.String(200), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    sales = db.relationship("Sale", backref="cashier", lazy=True, foreign_keys="Sale.cashier_id")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "full_name": self.full_name,
            "is_active": self.is_active is not False,
            "created_at": iso_utc(self.created_at),
        }


class Medicine(db.Model):
    __tablename__ = "medicines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    category = db.Column(db.String(100), nullable=False)

    # v2: names and identification
    generic_name = db.Column(db.String(200), nullable=True, index=True)
    name_mm = db.Column(db.String(200), nullable=True)  # Myanmar name, e.g. "ပါရာစီတမော"
    barcode = db.Column(db.String(64), nullable=True, index=True)
    manufacturer = db.Column(db.String(200), nullable=True)
    shelf_location = db.Column(db.String(50), nullable=True)
    requires_prescription = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    reorder_level = db.Column(db.Integer, nullable=False, default=10)

    # Product photo (optional). The file lives in file storage, like investigations.
    image_key = db.Column(db.String(300), nullable=True)

    # v2: selling units. Stock is always counted in the base unit (tablet,
    # capsule, bottle...). A strip and a box are optional bigger packs.
    unit_name = db.Column(db.String(30), nullable=False, default="tablet")
    strip_size = db.Column(db.Integer, nullable=True)  # base units per strip (ကဒ်)
    strip_price = db.Column(db.Numeric(12, 2), nullable=True)
    box_size = db.Column(db.Integer, nullable=True)  # base units per box (ဗူး)
    box_price = db.Column(db.Numeric(12, 2), nullable=True)

    # Cached totals, kept in step with the batches by app.inventory
    stock_quantity = db.Column(db.Integer, nullable=False, default=0)
    cost_price = db.Column(db.Numeric(10, 2), nullable=False)  # latest cost per base unit
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)  # price per base unit
    expiry_date = db.Column(db.Date, nullable=True)  # earliest expiry of batches in stock
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    sale_items = db.relationship("SaleItem", backref="medicine", lazy=True)
    batches = db.relationship(
        "MedicineBatch",
        backref="medicine",
        lazy=True,
        order_by=lambda: [MedicineBatch.expiry_date, MedicineBatch.id],
        cascade="all, delete-orphan",
    )

    @property
    def is_expired(self):
        return self.expiry_date is not None and self.expiry_date < local_today()

    def pack_options(self):
        """Selling units the till can offer, smallest first."""
        options = [
            {"unit": "unit", "label": self.unit_name or "unit", "size": 1, "price": _f(self.selling_price)}
        ]
        if self.strip_size and self.strip_size > 1:
            price = _f(self.strip_price) or _f(self.selling_price) * self.strip_size
            options.append({"unit": "strip", "label": "strip", "size": self.strip_size, "price": price})
        if self.box_size and self.box_size > 1:
            price = _f(self.box_price) or _f(self.selling_price) * self.box_size
            options.append({"unit": "box", "label": "box", "size": self.box_size, "price": price})
        return options

    def to_dict(self, warning_days=30, include_batches=False):
        today = local_today()
        batches = sorted(
            (b for b in self.batches if b.quantity > 0), key=lambda b: (b.expiry_date, b.id or 0)
        )
        sellable = [b for b in batches if b.expiry_date >= today]
        expired_qty = sum(b.quantity for b in batches if b.expiry_date < today)
        sellable_qty = sum(b.quantity for b in sellable)
        if sellable:
            nearest = sellable[0].expiry_date
        elif batches:  # only expired stock left
            nearest = batches[0].expiry_date
        else:
            nearest = None
        days_to_expiry = (nearest - today).days if nearest else None
        if days_to_expiry is None:
            status = "none"
        elif days_to_expiry < 0:
            status = "expired"
        elif days_to_expiry <= warning_days:
            status = "warning"
        else:
            status = "ok"
        d = {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "generic_name": self.generic_name,
            "name_mm": self.name_mm,
            "barcode": self.barcode,
            "manufacturer": self.manufacturer,
            "shelf_location": self.shelf_location,
            "requires_prescription": bool(self.requires_prescription),
            "is_active": self.is_active is not False,
            "reorder_level": self.reorder_level if self.reorder_level is not None else 10,
            "unit_name": self.unit_name or "tablet",
            "strip_size": self.strip_size,
            "strip_price": _f(self.strip_price) if self.strip_price is not None else None,
            "box_size": self.box_size,
            "box_price": _f(self.box_price) if self.box_price is not None else None,
            "pack_options": self.pack_options(),
            "stock_quantity": self.stock_quantity,
            "sellable_quantity": sellable_qty,
            "expired_quantity": expired_qty,
            "batch_count": len(batches),
            "cost_price": _f(self.cost_price),
            "selling_price": _f(self.selling_price),
            "expiry_date": nearest.isoformat() if nearest else None,
            "is_expired": status == "expired",
            "days_to_expiry": days_to_expiry,
            "expiry_status": status,
            "is_low_stock": self.stock_quantity <= (self.reorder_level or 0),
            "profit_per_unit": _f(self.selling_price) - _f(self.cost_price),
            "created_at": iso_utc(self.created_at),
            "has_image": bool(self.image_key),
            # changes whenever the photo changes, so browsers reload it
            "image_version": self.image_key.rsplit("/", 1)[-1].split(".")[0][:12] if self.image_key else None,
        }
        if include_batches:
            d["batches"] = [
                b.to_dict(warning_days)
                for b in sorted(self.batches, key=lambda b: (b.expiry_date, b.id or 0))
            ]
        return d


class MedicineBatch(db.Model):
    """One delivery (lot) of a medicine with its own expiry date and cost.

    Sales take stock from the batch that expires first (FEFO), so the
    pharmacy always sells the oldest stock and expiry tracking is exact.
    """

    __tablename__ = "medicine_batches"

    id = db.Column(db.Integer, primary_key=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_number = db.Column(db.String(80), nullable=True)
    expiry_date = db.Column(db.Date, nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)  # remaining, base units
    initial_quantity = db.Column(db.Integer, nullable=False, default=0)
    cost_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)  # per base unit
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self, warning_days=30):
        days = (self.expiry_date - local_today()).days
        return {
            "id": self.id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.name if self.medicine else None,
            "batch_number": self.batch_number,
            "expiry_date": self.expiry_date.isoformat(),
            "days_to_expiry": days,
            "expiry_status": "expired" if days < 0 else "warning" if days <= warning_days else "ok",
            "quantity": self.quantity,
            "initial_quantity": self.initial_quantity,
            "cost_price": _f(self.cost_price),
            "stock_value": _f(self.cost_price) * self.quantity,
            "purchase_id": self.purchase_id,
            "created_at": iso_utc(self.created_at),
        }


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    contact_person = db.Column(db.String(200), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    address = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "contact_person": self.contact_person,
            "phone": self.phone,
            "address": self.address,
            "notes": self.notes,
            "created_at": iso_utc(self.created_at),
        }


class Purchase(db.Model):
    """Stock received from a supplier (goods-received note)."""

    __tablename__ = "purchases"

    id = db.Column(db.Integer, primary_key=True)
    purchase_number = db.Column(db.String(30), unique=True, nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=True, index=True)
    invoice_number = db.Column(db.String(100), nullable=True)
    purchase_date = db.Column(db.Date, nullable=False)
    total_cost = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    supplier = db.relationship("Supplier", lazy="joined")
    creator = db.relationship("User", lazy="joined")
    batches = db.relationship("MedicineBatch", backref="purchase", lazy=True)

    def to_dict(self, include_items=True):
        d = {
            "id": self.id,
            "purchase_number": self.purchase_number,
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier.name if self.supplier else None,
            "invoice_number": self.invoice_number,
            "purchase_date": self.purchase_date.isoformat(),
            "total_cost": _f(self.total_cost),
            "notes": self.notes,
            "created_by_name": self.creator.username if self.creator else None,
            "created_at": iso_utc(self.created_at),
            "item_count": len(self.batches),
        }
        if include_items:
            d["items"] = [
                {
                    "batch_id": b.id,
                    "medicine_id": b.medicine_id,
                    "medicine_name": b.medicine.name if b.medicine else None,
                    "batch_number": b.batch_number,
                    "expiry_date": b.expiry_date.isoformat(),
                    "quantity": b.initial_quantity,
                    "remaining": b.quantity,
                    "cost_price": _f(b.cost_price),
                    "line_cost": _f(b.cost_price) * b.initial_quantity,
                }
                for b in self.batches
            ]
        return d


class StockMovement(db.Model):
    """Audit trail: every change to stock, with who did it and why."""

    __tablename__ = "stock_movements"

    id = db.Column(db.Integer, primary_key=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("medicine_batches.id"), nullable=True)
    change = db.Column(db.Integer, nullable=False)  # + in, - out (base units)
    reason = db.Column(db.String(30), nullable=False)
    reference = db.Column(db.String(60), nullable=True)
    note = db.Column(db.Text, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    medicine = db.relationship("Medicine", lazy="joined")
    batch = db.relationship("MedicineBatch", lazy="joined")
    user = db.relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.name if self.medicine else None,
            "batch_id": self.batch_id,
            "batch_number": self.batch.batch_number if self.batch else None,
            "change": self.change,
            "reason": self.reason,
            "reference": self.reference,
            "note": self.note,
            "user_name": self.user.username if self.user else None,
            "created_at": iso_utc(self.created_at),
        }


class AppSetting(db.Model):
    __tablename__ = "app_settings"

    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(255), nullable=False)

    @staticmethod
    def get(key, default=None):
        row = db.session.get(AppSetting, key)
        return row.value if row else default

    @staticmethod
    def set(key, value, commit=True):
        row = db.session.get(AppSetting, key)
        if row:
            row.value = str(value)
        else:
            row = AppSetting(key=key, value=str(value))
            db.session.add(row)
        if commit:
            db.session.commit()
        return row


class Patient(db.Model):
    """A patient, and also a registered customer (credit / အကြွေး accounts)."""

    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    patient_number = db.Column(db.String(20), unique=True, nullable=True, index=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    gender = db.Column(db.String(20), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    phone = db.Column(db.String(50), nullable=True, index=True)
    address = db.Column(db.Text, nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    medical_notes = db.Column(db.Text, nullable=True)
    nrc_number = db.Column(db.String(50), nullable=True)  # v2: Myanmar NRC (optional)
    credit_limit = db.Column(db.Numeric(14, 2), nullable=True)  # v2: max allowed debt
    created_at = db.Column(db.DateTime, default=utcnow)

    visits = db.relationship(
        "Sale", backref="patient", lazy=True, order_by="Sale.created_at.desc()"
    )
    investigations = db.relationship(
        "PatientInvestigation", backref="patient", lazy=True
    )

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        today = local_today()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def to_dict(self):
        return {
            "id": self.id,
            "patient_number": self.patient_number,
            "name": self.name,
            "gender": self.gender,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "age": self.age,
            "phone": self.phone,
            "address": self.address,
            "allergies": self.allergies,
            "medical_notes": self.medical_notes,
            "nrc_number": self.nrc_number,
            "credit_limit": _f(self.credit_limit) if self.credit_limit is not None else None,
            "created_at": iso_utc(self.created_at),
        }


class Sale(db.Model):
    __tablename__ = "sales"

    id = db.Column(db.Integer, primary_key=True)
    sale_number = db.Column(db.String(30), unique=True, nullable=False)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    delivery_fee = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    customer_name = db.Column(db.String(200), nullable=True)
    customer_address = db.Column(db.Text, nullable=True)
    customer_phone = db.Column(db.String(50), nullable=True)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    total_cost = db.Column(db.Numeric(10, 2), nullable=False)
    total_profit = db.Column(db.Numeric(10, 2), nullable=False)
    cashier_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    # Clinic / visit fields (all optional: a plain pharmacy sale leaves them empty)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=True, index=True)
    doctor_name = db.Column(db.String(200), nullable=True)
    doctor_fee = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    symptoms = db.Column(db.Text, nullable=True)
    diagnosis = db.Column(db.Text, nullable=True)
    visit_notes = db.Column(db.Text, nullable=True)

    # v2: discount and payment
    discount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    payment_method = db.Column(db.String(30), nullable=False, default="cash")
    payment_reference = db.Column(db.String(100), nullable=True)  # e.g. KBZPay transaction ID
    amount_paid = db.Column(db.Numeric(12, 2), nullable=True)  # None on v1 rows = fully paid
    amount_tendered = db.Column(db.Numeric(12, 2), nullable=True)  # cash handed over
    change_given = db.Column(db.Numeric(12, 2), nullable=True)

    # v2: void / refund
    status = db.Column(db.String(20), nullable=False, default="completed", index=True)
    voided_at = db.Column(db.DateTime, nullable=True)
    voided_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    void_reason = db.Column(db.Text, nullable=True)

    items = db.relationship(
        "SaleItem", backref="sale", lazy=True, cascade="all, delete-orphan"
    )
    voider = db.relationship("User", foreign_keys=[voided_by], lazy=True)

    @property
    def paid(self):
        return _f(self.total_amount) if self.amount_paid is None else _f(self.amount_paid)

    @property
    def balance_due(self):
        if self.status == "voided":
            return 0.0
        return max(_f(self.total_amount) - self.paid, 0.0)

    def to_dict(self):
        return {
            "id": self.id,
            "sale_number": self.sale_number,
            "subtotal": _f(self.subtotal),
            "delivery_fee": _f(self.delivery_fee),
            "doctor_fee": _f(self.doctor_fee),
            "discount": _f(self.discount),
            "doctor_name": self.doctor_name,
            "symptoms": self.symptoms,
            "diagnosis": self.diagnosis,
            "visit_notes": self.visit_notes,
            "patient_id": self.patient_id,
            "patient_number": self.patient.patient_number if self.patient else None,
            "patient_name": self.patient.name if self.patient else None,
            "customer_name": self.customer_name,
            "customer_address": self.customer_address,
            "customer_phone": self.customer_phone,
            "total_amount": _f(self.total_amount),
            "total_cost": _f(self.total_cost),
            "total_profit": _f(self.total_profit),
            "payment_method": self.payment_method or "cash",
            "payment_reference": self.payment_reference,
            "amount_paid": self.paid,
            "amount_tendered": _f(self.amount_tendered) if self.amount_tendered is not None else None,
            "change_given": _f(self.change_given) if self.change_given is not None else None,
            "balance_due": self.balance_due,
            "status": self.status or "completed",
            "voided_at": iso_utc(self.voided_at),
            "voided_by_name": self.voider.username if self.voider else None,
            "void_reason": self.void_reason,
            "cashier_id": self.cashier_id,
            "cashier_name": self.cashier.username if self.cashier else None,
            "created_at": iso_utc(self.created_at),
            "items": [item.to_dict() for item in self.items],
        }


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False)
    medicine_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)  # base units
    cost_price = db.Column(db.Numeric(10, 2), nullable=False)  # per base unit (average)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)  # per base unit
    line_total = db.Column(db.Numeric(10, 2), nullable=False)
    line_profit = db.Column(db.Numeric(10, 2), nullable=False)
    dosage = db.Column(db.String(300), nullable=True)  # e.g. "1 tab, 3x/day, 5 days"

    # v2: what the customer actually bought, e.g. 2 x strip(10) @ 1,500
    unit_label = db.Column(db.String(30), nullable=True)
    unit_size = db.Column(db.Integer, nullable=True)
    unit_qty = db.Column(db.Integer, nullable=True)
    unit_price = db.Column(db.Numeric(12, 2), nullable=True)

    batch_links = db.relationship(
        "SaleItemBatch", backref="sale_item", lazy=True, cascade="all, delete-orphan"
    )

    def to_dict(self):
        unit_qty = self.unit_qty if self.unit_qty is not None else self.quantity
        unit_price = _f(self.unit_price) if self.unit_price is not None else _f(self.selling_price)
        return {
            "id": self.id,
            "dosage": self.dosage,
            "medicine_id": self.medicine_id,
            "medicine_name": self.medicine_name,
            "quantity": self.quantity,
            "unit_label": self.unit_label,
            "unit_size": self.unit_size or 1,
            "unit_qty": unit_qty,
            "unit_price": unit_price,
            "cost_price": _f(self.cost_price),
            "selling_price": _f(self.selling_price),
            "line_total": _f(self.line_total),
            "line_profit": _f(self.line_profit),
        }


class SaleItemBatch(db.Model):
    """Which batches a sale line took its stock from (so a void can return it)."""

    __tablename__ = "sale_item_batches"

    id = db.Column(db.Integer, primary_key=True)
    sale_item_id = db.Column(db.Integer, db.ForeignKey("sale_items.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("medicine_batches.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    batch = db.relationship("MedicineBatch", lazy="joined")


class CreditPayment(db.Model):
    """Money received against a customer's credit (အကြွေး) balance."""

    __tablename__ = "credit_payments"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    payment_method = db.Column(db.String(30), nullable=False, default="cash")
    reference = db.Column(db.String(100), nullable=True)
    note = db.Column(db.Text, nullable=True)
    received_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    patient = db.relationship("Patient", lazy="joined")
    receiver = db.relationship("User", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient_name": self.patient.name if self.patient else None,
            "amount": _f(self.amount),
            "payment_method": self.payment_method,
            "reference": self.reference,
            "note": self.note,
            "received_by_name": self.receiver.username if self.receiver else None,
            "created_at": iso_utc(self.created_at),
        }


class PatientInvestigation(db.Model):
    """An investigation result (blood report, X-ray, scan...) attached to a patient.

    The file itself lives in file storage (Supabase Storage in production);
    this row only records where it is and what it is.
    """

    __tablename__ = "patient_investigations"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(
        db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True
    )
    # Optional link to the visit the test was ordered or reviewed at
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)  # e.g. "CBC", "Lipid profile"
    test_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    storage_key = db.Column(db.String(300), unique=True, nullable=False)
    original_filename = db.Column(db.String(255), nullable=True)
    content_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)

    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, index=True)

    uploader = db.relationship("User", lazy="joined")
    sale = db.relationship("Sale", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "sale_id": self.sale_id,
            "sale_number": self.sale.sale_number if self.sale else None,
            "title": self.title,
            "test_date": self.test_date.isoformat() if self.test_date else None,
            "notes": self.notes,
            "original_filename": self.original_filename,
            "content_type": self.content_type,
            "is_pdf": self.content_type == "application/pdf",
            "file_size": self.file_size,
            "uploaded_by": self.uploaded_by,
            "uploaded_by_name": self.uploader.username if self.uploader else None,
            "created_at": iso_utc(self.created_at),
        }
