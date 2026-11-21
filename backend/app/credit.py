"""Customer credit (အကြွေး) balances.

balance = what credit sales left unpaid  -  repayments received
Voided sales do not count. A negative balance is money paid in advance.
"""
from sqlalchemy import func

from app.models import CreditPayment, Sale, db


def _unpaid_expr():
    return func.coalesce(
        func.sum(Sale.total_amount - func.coalesce(Sale.amount_paid, Sale.total_amount)), 0
    )


def balances(patient_ids=None):
    """{patient_id: {"credit": owed from sales, "paid": repaid, "balance": ...}}"""
    q = db.session.query(Sale.patient_id, _unpaid_expr()).filter(
        Sale.patient_id.isnot(None), Sale.status != "voided", Sale.payment_method == "credit"
    )
    p = db.session.query(CreditPayment.patient_id, func.coalesce(func.sum(CreditPayment.amount), 0))
    if patient_ids is not None:
        q = q.filter(Sale.patient_id.in_(patient_ids))
        p = p.filter(CreditPayment.patient_id.in_(patient_ids))
    result = {}
    for pid, owed in q.group_by(Sale.patient_id).all():
        result.setdefault(pid, {"credit": 0.0, "paid": 0.0})["credit"] = float(owed)
    for pid, paid in p.group_by(CreditPayment.patient_id).all():
        result.setdefault(pid, {"credit": 0.0, "paid": 0.0})["paid"] = float(paid)
    for v in result.values():
        v["balance"] = round(v["credit"] - v["paid"], 2)
    return result


def patient_balance(patient_id):
    return balances([patient_id]).get(patient_id, {}).get("balance", 0.0)
