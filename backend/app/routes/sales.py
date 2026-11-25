import csv
import io
from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import joinedload, selectinload

from app import inventory
from app.credit import patient_balance
from app.models import (
    PAYMENT_METHODS, AppSetting, Medicine, Patient, Sale, SaleItem, SaleItemBatch, db, utcnow,
)
from app.timeutil import local_day_bounds, parse_date
from app.utils import (
    clean_text, current_role, current_user_id, error, generate_sale_number, role_required,
    to_int, to_number,
)

sales_bp = Blueprint("sales", __name__)

PROFIT_FIELDS = ("total_cost", "total_profit")
ITEM_PROFIT_FIELDS = ("cost_price", "line_profit")


def _public(d):
    if current_role() == "cashier":
        for key in PROFIT_FIELDS:
            d.pop(key, None)
        for item in d.get("items", []):
            for key in ITEM_PROFIT_FIELDS:
                item.pop(key, None)
    return d


def _filtered_query():
    """Sales query from request filters. Returns (query, error_response)."""
    args = request.args
    query = Sale.query.options(
        selectinload(Sale.items),
        joinedload(Sale.cashier),
        joinedload(Sale.patient),
    )
    patient_id = args.get("patient_id", type=int)
    if patient_id:
        query = query.filter(Sale.patient_id == patient_id)

    # Dates are local (Myanmar) calendar dates. A v1 client may send a full
    # ISO timestamp; only its date part is used.
    try:
        start = parse_date(args.get("start_date"))
        end = parse_date(args.get("end_date"))
    except ValueError:
        return None, error("Invalid date")
    if start or end:
        lo, _ = local_day_bounds(start or end)
        _, hi = local_day_bounds(end or start)
        if start:
            query = query.filter(Sale.created_at >= lo)
        if end:
            query = query.filter(Sale.created_at < hi)

    sale_number = args.get("sale_number", "").strip()
    if sale_number:
        query = query.filter(Sale.sale_number.ilike(f"%{sale_number}%"))
    method = args.get("payment_method", "").strip()
    if method:
        query = query.filter(Sale.payment_method == method)
    status = args.get("status", "").strip()
    if status == "voided":
        query = query.filter(Sale.status == "voided")
    elif status == "completed":
        query = query.filter(Sale.status != "voided")
    cashier_id = args.get("cashier_id", type=int)
    if cashier_id:
        query = query.filter(Sale.cashier_id == cashier_id)
    return query.order_by(Sale.created_at.desc(), Sale.id.desc()), None


@sales_bp.route("", methods=["GET"])
@jwt_required()
def list_sales():
    query, err = _filtered_query()
    if err:
        return err
    page = request.args.get("page", type=int)
    if not page:  # v1 behaviour: a plain list of the latest 500
        return jsonify([_public(s.to_dict()) for s in query.limit(500).all()])
    per_page = min(max(request.args.get("per_page", 25, type=int), 1), 200)
    total = query.order_by(None).count()
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({
        "items": [_public(s.to_dict()) for s in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max((total + per_page - 1) // per_page, 1),
    })


@sales_bp.route("/export.csv", methods=["GET"])
@jwt_required()
@role_required("admin")
def export_sales():
    query, err = _filtered_query()
    if err:
        return err
    out = io.StringIO()
    out.write("﻿")  # BOM so Excel shows Myanmar text correctly
    w = csv.writer(out)
    w.writerow([
        "Sale #", "Date (UTC)", "Status", "Customer/Patient", "Cashier", "Payment", "Reference",
        "Subtotal", "Doctor fee", "Delivery fee", "Discount", "Total", "Paid", "Balance due",
        "Cost", "Profit", "Items",
    ])
    for s in query.limit(20000).all():
        w.writerow([
            s.sale_number, s.created_at.strftime("%Y-%m-%d %H:%M"), s.status or "completed",
            (s.patient.name if s.patient else s.customer_name) or "", s.cashier.username if s.cashier else "",
            s.payment_method or "cash", s.payment_reference or "",
            float(s.subtotal), float(s.doctor_fee or 0), float(s.delivery_fee or 0), float(s.discount or 0),
            float(s.total_amount), s.paid, s.balance_due, float(s.total_cost), float(s.total_profit),
            "; ".join(f"{i.medicine_name} x{i.quantity}" for i in s.items),
        ])
    return Response(
        out.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=sales.csv"},
    )


@sales_bp.route("/<int:sale_id>", methods=["GET"])
@jwt_required()
def get_sale(sale_id):
    sale = (
        Sale.query.options(
            selectinload(Sale.items),
            joinedload(Sale.cashier),
            joinedload(Sale.patient),
        )
        .filter_by(id=sale_id)
        .first_or_404()
    )
    return jsonify(_public(sale.to_dict()))


@sales_bp.route("/checkout", methods=["POST"])
@jwt_required()
def checkout():
    """Complete a sale or patient visit. All-or-nothing: on any error nothing is saved.

    items: [{medicine_id, quantity, unit: unit|strip|box (default unit), dosage?}]
    payment_method: cash | kbzpay | wavepay | ayapay | cbpay | uabpay | mpu_card |
                    bank_transfer | credit
    """
    data = request.get_json() or {}
    items = data.get("items") or []
    user_id = current_user_id()

    fees = {}
    for key in ("delivery_fee", "doctor_fee", "discount"):
        fees[key], err = to_number(data.get(key), key.replace("_", " ").capitalize())
        if err:
            return error(err)

    patient = None
    if data.get("patient_id"):
        patient = db.session.get(Patient, int(data["patient_id"]))
        if not patient:
            return error("Patient not found", 404)

    customer_name = clean_text(data.get("customer_name"), 200) or (patient.name if patient else None)
    customer_address = clean_text(data.get("customer_address")) or (patient.address if patient else None)
    customer_phone = clean_text(data.get("customer_phone"), 50) or (patient.phone if patient else None)

    if fees["delivery_fee"] > 0:
        if not customer_name:
            return error("Customer name is required for delivery orders")
        if not customer_address:
            return error("Customer address is required for delivery orders")

    if not items and fees["doctor_fee"] <= 0:
        return error("Add a medicine or a doctor fee")

    # Parse lines and check total stock per medicine before touching anything
    parsed = []
    needed = {}
    medicines = {}
    for item in items:
        try:
            medicine_id = int(item.get("medicine_id"))
        except (TypeError, ValueError):
            return error("Invalid item in cart")
        qty, err = to_int(item.get("quantity"), "Quantity", minimum=1)
        if err:
            return error("Quantity must be at least 1")
        medicine = medicines.get(medicine_id) or db.session.get(Medicine, medicine_id)
        if not medicine:
            return error(f"Medicine {medicine_id} not found", 404)
        if medicine.is_active is False:
            return error(f"{medicine.name} is inactive and cannot be sold")
        medicines[medicine_id] = medicine
        unit = item.get("unit") or "unit"
        option = next((o for o in medicine.pack_options() if o["unit"] == unit), None)
        if option is None:
            return error(f"{medicine.name} cannot be sold by {unit}")
        base_qty = qty * option["size"]
        needed[medicine_id] = needed.get(medicine_id, 0) + base_qty
        parsed.append((medicine, option, qty, base_qty, clean_text(item.get("dosage"), 300)))

    for medicine_id, qty in needed.items():
        medicine = medicines[medicine_id]
        available = inventory.sellable_quantity(medicine)
        if available < qty:
            if available == 0 and medicine.stock_quantity > 0:
                return error(f"{medicine.name} is expired and cannot be sold")
            return error(f"Insufficient stock for {medicine.name}. Available: {available}")

    sale = Sale(
        sale_number=generate_sale_number(),
        subtotal=0,
        delivery_fee=fees["delivery_fee"],
        doctor_fee=fees["doctor_fee"],
        discount=fees["discount"],
        doctor_name=clean_text(data.get("doctor_name"), 200),
        symptoms=clean_text(data.get("symptoms")),
        diagnosis=clean_text(data.get("diagnosis")),
        visit_notes=clean_text(data.get("visit_notes")),
        patient_id=patient.id if patient else None,
        customer_name=customer_name,
        customer_address=customer_address,
        customer_phone=customer_phone,
        total_amount=0,
        total_cost=0,
        total_profit=0,
        cashier_id=user_id,
        status="completed",
    )
    db.session.add(sale)
    db.session.flush()

    subtotal = 0.0
    total_cost = 0.0
    for medicine, option, qty, base_qty, dosage in parsed:
        try:
            plan = inventory.allocate_fefo(medicine, base_qty)
        except inventory.StockError as e:
            db.session.rollback()
            return error(str(e))
        cost = sum(float(b.cost_price or 0) * take for b, take in plan)
        line_total = round(option["price"] * qty, 2)
        sale_item = SaleItem(
            sale_id=sale.id,
            medicine_id=medicine.id,
            medicine_name=medicine.name,
            quantity=base_qty,
            cost_price=round(cost / base_qty, 4),
            selling_price=round(line_total / base_qty, 4),
            line_total=line_total,
            line_profit=round(line_total - cost, 2),
            dosage=dosage,
            unit_label=option["label"],
            unit_size=option["size"],
            unit_qty=qty,
            unit_price=option["price"],
        )
        db.session.add(sale_item)
        db.session.flush()
        for batch, take in plan:
            db.session.add(SaleItemBatch(sale_item_id=sale_item.id, batch_id=batch.id, quantity=take))
        inventory.take_stock(medicine, plan, sale.sale_number, user_id)
        subtotal += line_total
        total_cost += cost

    gross = subtotal + fees["delivery_fee"] + fees["doctor_fee"]
    discount = fees["discount"]
    if discount > gross:
        db.session.rollback()
        return error("Discount cannot be more than the total")
    if discount > 0 and current_role() == "cashier":
        max_pct = float(AppSetting.get("cashier_max_discount_percent", "10") or 0)
        if gross > 0 and discount / gross * 100 > max_pct + 1e-9:
            db.session.rollback()
            return error(f"Cashiers can give at most {max_pct:g}% discount. Ask an admin or pharmacist.", 403)

    total = round(gross - discount, 2)
    sale.subtotal = round(subtotal, 2)
    sale.total_amount = total
    sale.total_cost = round(total_cost, 2)
    # Fees carry no product cost, so they count as profit; the discount reduces it.
    sale.total_profit = round(subtotal - total_cost + fees["delivery_fee"] + fees["doctor_fee"] - discount, 2)

    # ---- payment ----
    method = data.get("payment_method") or "cash"
    if method not in PAYMENT_METHODS:
        db.session.rollback()
        return error("Invalid payment method")
    sale.payment_method = method
    sale.payment_reference = clean_text(data.get("payment_reference"), 100)

    if method == "credit":
        if not patient:
            db.session.rollback()
            return error("Choose a registered customer or patient for a credit (အကြွေး) sale")
        paid, err = to_number(data.get("amount_paid"), "Amount paid now")
        if err:
            db.session.rollback()
            return error(err)
        if paid > total:
            db.session.rollback()
            return error("Amount paid now cannot be more than the total")
        sale.amount_paid = paid
        if patient.credit_limit is not None:
            new_balance = patient_balance(patient.id) + (total - paid)
            if new_balance > float(patient.credit_limit) + 1e-6:
                db.session.rollback()
                return error(
                    f"Credit limit exceeded for {patient.name}: limit {float(patient.credit_limit):,.0f}, "
                    f"balance after this sale {new_balance:,.0f}"
                )
    else:
        sale.amount_paid = total
        if method == "cash" and data.get("amount_tendered") not in (None, ""):
            tendered, err = to_number(data.get("amount_tendered"), "Cash received")
            if err:
                db.session.rollback()
                return error(err)
            if tendered + 1e-6 < total:
                db.session.rollback()
                return error("Cash received is less than the total")
            sale.amount_tendered = tendered
            sale.change_given = round(tendered - total, 2)

    db.session.commit()
    return jsonify(_public(sale.to_dict())), 201


@sales_bp.route("/<int:sale_id>/void", methods=["POST"])
@jwt_required()
@role_required("admin")
def void_sale(sale_id):
    """Cancel a sale or visit: stock goes back to its batches and it leaves the reports."""
    sale = Sale.query.get_or_404(sale_id)
    if sale.status == "voided":
        return error("This sale is already voided", 409)
    reason = clean_text((request.get_json() or {}).get("reason"), 500)
    if not reason:
        return error("Enter a reason for voiding")
    user_id = current_user_id()
    for item in sale.items:
        inventory.restore_sale_item(item, sale.sale_number, user_id)
    sale.status = "voided"
    sale.voided_at = utcnow()
    sale.voided_by = user_id
    sale.void_reason = reason
    db.session.commit()
    return jsonify(_public(sale.to_dict()))
