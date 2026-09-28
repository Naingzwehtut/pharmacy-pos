"""Upgrade an existing database to the clinic version.

Safe to run any number of times. It:
  * creates the new `patients` table
  * adds the new clinic columns to `sales` and `sale_items` if they are missing

Your existing medicines, sales and users are NOT touched.

Usage:  python upgrade_db.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import inspect, text

from app import create_app
from app.models import db

NEW_COLUMNS = {
    "sales": [
        ("patient_id", "INTEGER REFERENCES patients(id)"),
        ("doctor_name", "VARCHAR(200)"),
        ("doctor_fee", "NUMERIC(10, 2) NOT NULL DEFAULT 0"),
        ("symptoms", "TEXT"),
        ("diagnosis", "TEXT"),
        ("visit_notes", "TEXT"),
    ],
    "sale_items": [
        ("dosage", "VARCHAR(300)"),
    ],
}


def upgrade():
    app = create_app()
    with app.app_context():
        db.create_all()  # creates `patients` (and any other missing table)

        inspector = inspect(db.engine)
        for table, columns in NEW_COLUMNS.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name in existing:
                    continue
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                print(f"  added {table}.{name}")
        db.session.commit()
        print("Database is up to date.")


if __name__ == "__main__":
    upgrade()
