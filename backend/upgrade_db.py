"""Upgrade an existing database (v1 or clinic version) to v2.

Safe to run any number of times. It never deletes data. It:
  * creates the new tables (batches, suppliers, purchases, stock movements,
    credit payments...)
  * adds the new columns to existing tables
  * turns each medicine's current stock into an "opening" batch, so stock
    and expiry tracking carry on exactly as before

Back up your database first (Supabase: Database -> Backups).

Usage:  python upgrade_db.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import inspect, text

from app import create_app
from app.models import Medicine, MedicineBatch, StockMovement, db

NEW_COLUMNS = {
    "users": [
        ("full_name", "VARCHAR(200)"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ],
    "medicines": [
        ("generic_name", "VARCHAR(200)"),
        ("name_mm", "VARCHAR(200)"),
        ("barcode", "VARCHAR(64)"),
        ("manufacturer", "VARCHAR(200)"),
        ("shelf_location", "VARCHAR(50)"),
        ("requires_prescription", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("reorder_level", "INTEGER NOT NULL DEFAULT 10"),
        ("unit_name", "VARCHAR(30) NOT NULL DEFAULT 'tablet'"),
        ("strip_size", "INTEGER"),
        ("strip_price", "NUMERIC(12, 2)"),
        ("box_size", "INTEGER"),
        ("box_price", "NUMERIC(12, 2)"),
    ],
    "patients": [
        ("nrc_number", "VARCHAR(50)"),
        ("credit_limit", "NUMERIC(14, 2)"),
    ],
    "sales": [
        # clinic version
        ("patient_id", "INTEGER REFERENCES patients(id)"),
        ("doctor_name", "VARCHAR(200)"),
        ("doctor_fee", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
        ("symptoms", "TEXT"),
        ("diagnosis", "TEXT"),
        ("visit_notes", "TEXT"),
        # v2
        ("customer_phone", "VARCHAR(50)"),
        ("discount", "NUMERIC(12, 2) NOT NULL DEFAULT 0"),
        ("payment_method", "VARCHAR(30) NOT NULL DEFAULT 'cash'"),
        ("payment_reference", "VARCHAR(100)"),
        ("amount_paid", "NUMERIC(12, 2)"),
        ("amount_tendered", "NUMERIC(12, 2)"),
        ("change_given", "NUMERIC(12, 2)"),
        ("status", "VARCHAR(20) NOT NULL DEFAULT 'completed'"),
        ("voided_at", "TIMESTAMP"),
        ("voided_by", "INTEGER REFERENCES users(id)"),
        ("void_reason", "TEXT"),
    ],
    "sale_items": [
        ("dosage", "VARCHAR(300)"),
        ("unit_label", "VARCHAR(30)"),
        ("unit_size", "INTEGER"),
        ("unit_qty", "INTEGER"),
        ("unit_price", "NUMERIC(12, 2)"),
    ],
}


def upgrade():
    app = create_app()
    with app.app_context():
        db.create_all()  # creates every missing table

        inspector = inspect(db.engine)
        dialect = db.engine.dialect.name
        for table, columns in NEW_COLUMNS.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name in existing:
                    continue
                if dialect == "sqlite":
                    ddl = ddl.replace("TRUE", "1").replace("FALSE", "0")
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                print(f"  added {table}.{name}")
        db.session.commit()

        # A medicine may now exist before any stock arrives, so no expiry yet
        if dialect == "postgresql":
            db.session.execute(text("ALTER TABLE medicines ALTER COLUMN expiry_date DROP NOT NULL"))
            db.session.commit()

        # Move existing stock into batches (only for medicines with no batch yet)
        with_batches = {mid for (mid,) in db.session.query(MedicineBatch.medicine_id).distinct()}
        moved = 0
        for m in Medicine.query.all():
            if m.id in with_batches or not m.stock_quantity or m.stock_quantity <= 0:
                continue
            batch = MedicineBatch(
                medicine_id=m.id,
                batch_number="OPENING",
                expiry_date=m.expiry_date,
                quantity=m.stock_quantity,
                initial_quantity=m.stock_quantity,
                cost_price=m.cost_price or 0,
            )
            db.session.add(batch)
            db.session.flush()
            db.session.add(StockMovement(
                medicine_id=m.id, batch_id=batch.id, change=m.stock_quantity,
                reason="opening", note="Moved from v1 stock by upgrade_db.py",
            ))
            moved += 1
        db.session.commit()
        if moved:
            print(f"  created opening batches for {moved} medicines")
        print("Database is up to date (v2).")


if __name__ == "__main__":
    upgrade()
