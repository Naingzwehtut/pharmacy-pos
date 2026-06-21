"""Seed default users and sample medicines."""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import Medicine, User, db

app = create_app()

SAMPLE_MEDICINES = [
    ("Paracetamol 500mg", "Pain Relief", 200, 0.15, 0.50, 365),
    ("Amoxicillin 250mg", "Antibiotic", 80, 1.20, 3.50, 180),
    ("Ibuprofen 400mg", "Pain Relief", 150, 0.25, 0.75, 300),
    ("Cetirizine 10mg", "Allergy", 120, 0.30, 1.00, 270),
    ("Omeprazole 20mg", "Digestive", 90, 0.80, 2.50, 200),
    ("Metformin 500mg", "Diabetes", 100, 0.40, 1.25, 250),
    ("Amlodipine 5mg", "Cardiovascular", 75, 0.60, 2.00, 220),
    ("Vitamin C 1000mg", "Supplements", 180, 0.20, 0.65, 400),
    ("Cough Syrup 100ml", "Respiratory", 60, 2.50, 6.00, 150),
    ("Hydrocortisone Cream", "Dermatology", 45, 1.50, 4.50, 120),
    ("Expired Test Med", "Test", 10, 1.00, 3.00, -30),
    ("Low Stock Med", "Test", 3, 0.50, 1.50, 90),
]


def seed():
    with app.app_context():
        db.create_all()

        if not User.query.filter_by(username="admin").first():
            admin = User(username="admin", role="admin")
            admin.set_password("admin123")
            db.session.add(admin)

        if not User.query.filter_by(username="cashier").first():
            cashier = User(username="cashier", role="cashier")
            cashier.set_password("cashier123")
            db.session.add(cashier)

        if Medicine.query.count() == 0:
            for name, cat, stock, cost, sell, days_offset in SAMPLE_MEDICINES:
                med = Medicine(
                    name=name,
                    category=cat,
                    stock_quantity=stock,
                    cost_price=cost,
                    selling_price=sell,
                    expiry_date=date.today() + timedelta(days=days_offset),
                )
                db.session.add(med)

        db.session.commit()
        print("Database seeded successfully.")
        print("  admin / admin123")
        print("  cashier / cashier123")


if __name__ == "__main__":
    seed()
