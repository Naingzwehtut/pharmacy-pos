"""Stock rules, in one place.

* Stock lives in batches (lots). ``Medicine.stock_quantity`` and
  ``Medicine.expiry_date`` are caches recalculated from the batches.
* Sales take stock First-Expiry-First-Out and never from an expired batch.
* Every change writes a ``StockMovement`` row (the audit trail).

Functions here only stage changes in the session; the caller commits.
"""
from app.models import MedicineBatch, StockMovement, db
from app.timeutil import local_today


class StockError(Exception):
    pass


ADJUST_REASONS = ("count", "damaged", "expired", "lost", "returned_to_supplier", "other")


def ordered_batches(medicine):
    return sorted(medicine.batches, key=lambda b: (b.expiry_date, b.id or 0))


def recalc(medicine):
    in_stock = [b for b in medicine.batches if b.quantity > 0]
    medicine.stock_quantity = sum(b.quantity for b in in_stock)
    if in_stock:
        medicine.expiry_date = min(b.expiry_date for b in in_stock)


def sellable_quantity(medicine):
    today = local_today()
    return sum(b.quantity for b in medicine.batches if b.quantity > 0 and b.expiry_date >= today)


def add_batch(medicine, quantity, expiry_date, cost_price, batch_number=None,
              purchase=None, reason="purchase", reference=None, user_id=None, note=None):
    if quantity <= 0:
        raise StockError("Quantity must be at least 1")
    batch = MedicineBatch(
        medicine=medicine,
        batch_number=batch_number,
        expiry_date=expiry_date,
        quantity=quantity,
        initial_quantity=quantity,
        cost_price=cost_price,
        purchase=purchase,
    )
    db.session.add(batch)
    db.session.flush()
    db.session.add(StockMovement(
        medicine_id=medicine.id, batch_id=batch.id, change=quantity,
        reason=reason, reference=reference, note=note, user_id=user_id,
    ))
    if cost_price:
        medicine.cost_price = cost_price
    recalc(medicine)
    return batch


def allocate_fefo(medicine, quantity):
    """[(batch, take), ...] covering `quantity` from unexpired batches, earliest expiry first."""
    today = local_today()
    remaining = quantity
    plan = []
    for batch in ordered_batches(medicine):
        if remaining <= 0:
            break
        if batch.quantity <= 0 or batch.expiry_date < today:
            continue
        take = min(batch.quantity, remaining)
        plan.append((batch, take))
        remaining -= take
    if remaining > 0:
        available = quantity - remaining
        raise StockError(
            f"Not enough stock for {medicine.name}. Available (not expired): {available}"
        )
    return plan


def take_stock(medicine, plan, reference, user_id):
    for batch, take in plan:
        batch.quantity -= take
        db.session.add(StockMovement(
            medicine_id=medicine.id, batch_id=batch.id, change=-take,
            reason="sale", reference=reference, user_id=user_id,
        ))
    recalc(medicine)


def adjust(medicine, change, reason, user_id, batch=None, note=None, expiry_date=None, cost_price=None):
    """Manual correction. Positive change adds to a batch (or a new one),
    negative change removes from the given batch, or FEFO across all batches."""
    if reason not in ADJUST_REASONS:
        raise StockError("Choose a reason for the adjustment")
    if change == 0:
        raise StockError("The change cannot be zero")

    if change > 0:
        if batch is None:
            if expiry_date is None:
                raise StockError("Enter the expiry date for the added stock")
            return add_batch(
                medicine, change, expiry_date, cost_price if cost_price is not None else medicine.cost_price,
                reason=f"adjust:{reason}", user_id=user_id, note=note,
            )
        batch.quantity += change
        db.session.add(StockMovement(
            medicine_id=medicine.id, batch_id=batch.id, change=change,
            reason=f"adjust:{reason}", note=note, user_id=user_id,
        ))
        recalc(medicine)
        return batch

    needed = -change
    if batch is not None:
        if batch.quantity < needed:
            raise StockError(f"This batch only has {batch.quantity} left")
        targets = [(batch, needed)]
    else:
        # Removing without a batch: expired stock first (when writing off), else earliest expiry
        targets = []
        remaining = needed
        for b in ordered_batches(medicine):
            if remaining <= 0:
                break
            if b.quantity <= 0:
                continue
            take = min(b.quantity, remaining)
            targets.append((b, take))
            remaining -= take
        if remaining > 0:
            raise StockError(f"Only {needed - remaining} in stock")
    for b, take in targets:
        b.quantity -= take
        db.session.add(StockMovement(
            medicine_id=medicine.id, batch_id=b.id, change=-take,
            reason=f"adjust:{reason}", note=note, user_id=user_id,
        ))
    recalc(medicine)
    return batch


def restore_sale_item(item, reference, user_id):
    """Put a voided sale line's stock back into the batches it came from."""
    medicine = item.medicine
    if item.batch_links:
        for link in item.batch_links:
            link.batch.quantity += link.quantity
            db.session.add(StockMovement(
                medicine_id=medicine.id, batch_id=link.batch_id, change=link.quantity,
                reason="void", reference=reference, user_id=user_id,
            ))
    else:
        # A v1 sale (before batches): return it to the latest-expiring batch
        batches = ordered_batches(medicine)
        target = batches[-1] if batches else None
        if target is None:
            target = MedicineBatch(
                medicine=medicine, batch_number="RESTORED",
                expiry_date=medicine.expiry_date or local_today(),
                quantity=0, initial_quantity=0, cost_price=item.cost_price,
            )
            db.session.add(target)
            db.session.flush()
        target.quantity += item.quantity
        db.session.add(StockMovement(
            medicine_id=medicine.id, batch_id=target.id, change=item.quantity,
            reason="void", reference=reference, user_id=user_id,
        ))
    recalc(medicine)
