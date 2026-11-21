"""Credit (အကြွေး) accounts: who owes what, statements and repayments."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import selectinload

from app.credit import balances
from app.models import PAYMENT_METHODS, CreditPayment, Patient, Sale, db
from app.timeutil import iso_utc
from app.utils import clean_text, current_user_id, error, role_required, to_number

credit_bp = Blueprint("credit", __name__)


@credit_bp.route("/accounts", methods=["GET"])
@jwt_required()
def list_accounts():
    """Customers with a non-zero balance, biggest debt first."""
    data = {pid: v for pid, v in balances().items() if abs(v["balance"]) > 0.005}
    if not data:
        return jsonify({"accounts": [], "total_outstanding": 0})
    patients = {p.id: p for p in Patient.query.filter(Patient.id.in_(data.keys())).all()}
    last_sale = dict(
        db.session.query(Sale.patient_id, db.func.max(Sale.created_at))
        .filter(Sale.patient_id.in_(data.keys()), Sale.payment_method == "credit")
        .group_by(Sale.patient_id)
        .all()
    )
    accounts = []
    for pid, v in data.items():
        p = patients.get(pid)
        if not p:
            continue
        d = p.to_dict()
        d.update(v)
        last = last_sale.get(pid)
        d["last_credit_sale"] = iso_utc(last)
        accounts.append(d)
    accounts.sort(key=lambda a: -a["balance"])
    total = round(sum(a["balance"] for a in accounts if a["balance"] > 0), 2)
    return jsonify({"accounts": accounts, "total_outstanding": total})


@credit_bp.route("/accounts/<int:patient_id>", methods=["GET"])
@jwt_required()
def statement(patient_id):
    """Ledger: credit sales (debits) and repayments (credits) in date order."""
    patient = Patient.query.get_or_404(patient_id)
    sales = (
        Sale.query.options(selectinload(Sale.items))
        .filter(Sale.patient_id == patient_id, Sale.payment_method == "credit")
        .order_by(Sale.created_at)
        .all()
    )
    payments = CreditPayment.query.filter_by(patient_id=patient_id).order_by(CreditPayment.created_at).all()

    entries = []
    for s in sales:
        if s.status == "voided":
            continue
        entries.append({
            "type": "sale",
            "date": s.created_at,
            "sale_id": s.id,
            "reference": s.sale_number,
            "description": ", ".join(i.medicine_name for i in s.items) or "Consultation",
            "debit": float(s.total_amount),
            "credit": s.paid,
        })
    for p in payments:
        entries.append({
            "type": "payment",
            "date": p.created_at,
            "payment_id": p.id,
            "reference": p.reference,
            "description": f"Payment ({p.payment_method})" + (f" – {p.note}" if p.note else ""),
            "debit": 0.0,
            "credit": float(p.amount),
            "received_by": p.receiver.username if p.receiver else None,
        })
    entries.sort(key=lambda e: e["date"].replace(tzinfo=None))
    running = 0.0
    for e in entries:
        running = round(running + e["debit"] - e["credit"], 2)
        e["balance"] = running
        e["date"] = iso_utc(e["date"])

    summary = balances([patient_id]).get(patient_id, {"credit": 0.0, "paid": 0.0, "balance": 0.0})
    return jsonify({"patient": patient.to_dict(), "entries": entries, **summary})


@credit_bp.route("/accounts/<int:patient_id>/payments", methods=["POST"])
@jwt_required()
def receive_payment(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    data = request.get_json() or {}
    amount, err = to_number(data.get("amount"), "Amount")
    if err:
        return error(err)
    if amount <= 0:
        return error("Amount must be more than zero")
    method = data.get("payment_method") or "cash"
    if method not in PAYMENT_METHODS or method == "credit":
        return error("Invalid payment method")
    payment = CreditPayment(
        patient_id=patient.id,
        amount=amount,
        payment_method=method,
        reference=clean_text(data.get("reference"), 100),
        note=clean_text(data.get("note"), 500),
        received_by=current_user_id(),
    )
    db.session.add(payment)
    db.session.commit()
    summary = balances([patient.id]).get(patient.id, {"balance": 0.0})
    return jsonify({"payment": payment.to_dict(), "balance": summary["balance"]}), 201


@credit_bp.route("/payments/<int:payment_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_payment(payment_id):
    payment = CreditPayment.query.get_or_404(payment_id)
    db.session.delete(payment)
    db.session.commit()
    return jsonify({"message": "Payment deleted"})
