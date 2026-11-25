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

from app import create_app
from app.migrations import upgrade_database


def upgrade():
    app = create_app()
    with app.app_context():
        upgrade_database()
        print("Database is up to date (v2).")


if __name__ == "__main__":
    upgrade()
