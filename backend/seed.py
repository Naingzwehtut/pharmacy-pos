"""Create the tables and sample data for LOCAL DEVELOPMENT.

    python seed.py          # users, medicines with batches, suppliers, patients
    python seed.py --demo   # also ~3 weeks of sample sales for the dashboard

Never use the sample accounts on a real system.
"""
import os
import random
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, inventory
from app.models import (
    AppSetting, CreditPayment, Medicine, Patient, Sale, SaleItem, SaleItemBatch, Supplier, User, db,
)
from app.timeutil import local_today
from app.utils import generate_sale_number

app = create_app()

USERS = [
    ("admin", "admin123", "admin", "Pharmacy Owner"),
    ("pharmacist", "pharma123", "pharmacist", "Daw Thida"),
    ("cashier", "cashier123", "cashier", "Ko Aung"),
]

# name, generic, Myanmar name, category, unit, strip(size, price), box(size, price),
# unit price, unit cost, stock, expiry days, Rx, barcode
SAMPLE_MEDICINES = [
    ("Paracap 500mg", "Paracetamol", "ပါရာစီတမော", "Pain Relief", "tablet", (10, 500), (100, 4500), 50, 30, 600, 540, False, "8850000000011"),
    ("Biogesic 500mg", "Paracetamol", "ဘိုင်အိုဂျက်စစ်", "Pain Relief", "tablet", (10, 700), (100, 6500), 70, 45, 400, 420, False, "4800010000020"),
    ("Brufen 400mg", "Ibuprofen", "အိုင်ဗျူပရိုဖင်", "Pain Relief", "tablet", (10, 1200), (100, 11000), 120, 80, 300, 380, False, "8850000000035"),
    ("Amoxil 500mg", "Amoxicillin", "အမောက်ဆီလင်", "Antibiotic", "capsule", (10, 2500), (100, 23000), 250, 160, 200, 200, True, "8850000000042"),
    ("Augmentin 625mg", "Amoxicillin + Clavulanate", "", "Antibiotic", "tablet", (7, 9800), (14, 19000), 1400, 1000, 98, 150, True, "8850000000059"),
    ("Cetrizet 10mg", "Cetirizine", "စီထရီဇင်း", "Allergy", "tablet", (10, 800), (100, 7500), 80, 45, 250, 300, False, "8850000000066"),
    ("Omez 20mg", "Omeprazole", "အိုမီပရာဇော", "Digestive", "capsule", (10, 1500), (100, 14000), 150, 90, 200, 25, False, "8850000000073"),
    ("ORS (Royal-D)", "Oral rehydration salts", "ဓာတ်ဆားရည်", "Digestive", "sachet", None, (50, 9000), 200, 120, 150, 365, False, "8850000000080"),
    ("Metformin 500mg", "Metformin", "မက်ဖော်မင်", "Diabetes", "tablet", (10, 600), (100, 5500), 60, 35, 300, 250, True, "8850000000097"),
    ("Amlodipine 5mg", "Amlodipine", "အမ်လိုဒီပင်း", "Cardiovascular", "tablet", (10, 1000), (100, 9000), 100, 55, 200, 220, True, "8850000000103"),
    ("Coartem 20/120", "Artemether + Lumefantrine", "ငှက်ဖျားဆေး", "Antimalarial", "tablet", (24, 6000), None, 250, 170, 96, 400, True, "8850000000110"),
    ("Vitamin C 1000mg", "Ascorbic acid", "ဗီတာမင်စီ", "Supplements", "tablet", (10, 1500), (30, 4200), 150, 90, 180, 400, False, "8850000000127"),
    ("Neurobion", "Vitamin B1, B6, B12", "ဗီတာမင်ဘီ", "Supplements", "tablet", (10, 2500), (30, 7000), 250, 170, 150, 300, False, "8850000000134"),
    ("Actifed Syrup 100ml", "Triprolidine + Pseudoephedrine", "ချောင်းဆိုးဆေးရည်", "Respiratory", "bottle", None, None, 4500, 3000, 60, 18, False, "8850000000141"),
    ("Salbutamol Inhaler", "Salbutamol", "ပန်းနာရင်ကျပ်ဆေး", "Respiratory", "inhaler", None, None, 8500, 6000, 25, 280, True, "8850000000158"),
    ("Betadine 30ml", "Povidone-iodine", "ဘီတာဒင်း", "First Aid", "bottle", None, None, 3500, 2400, 80, 600, False, "8850000000165"),
    ("Hydrocortisone Cream 1%", "Hydrocortisone", "", "Dermatology", "tube", None, None, 3000, 1900, 30, 120, False, "8850000000172"),
    ("Old Stock Test Med", "Test", "", "Test", "tablet", (10, 1000), None, 100, 60, 30, -20, False, None),
]

SUPPLIERS = [
    ("Mega Lifesciences (Myanmar)", "U Kyaw Kyaw", "09 450 000 111", "Yangon"),
    ("AA Medical Products", "Daw Hnin", "09 420 000 222", "Mandalay"),
    ("City Pharma Wholesale", "Ko Zaw", "09 250 000 333", "Yangon, Lanmadaw"),
]

PATIENTS = [
    ("Daw Aye Aye", "Female", "09 790 000 001", "No. 12, Bogyoke Road, Yangon", "Penicillin", 300000),
    ("U Mya Win", "Male", "09 780 000 002", "Hlaing Township, Yangon", None, 200000),
    ("Ma Su Su", "Female", "09 450 000 003", "Sanchaung, Yangon", None, None),
]


def seed(demo=False):
    with app.app_context():
        db.create_all()

        for username, password, role, full_name in USERS:
            if not User.query.filter_by(username=username).first():
                u = User(username=username, role=role, full_name=full_name)
                u.set_password(password)
                db.session.add(u)
        db.session.flush()
        admin = User.query.filter_by(username="admin").first()

        if not AppSetting.get("pharmacy_name"):
            AppSetting.set("pharmacy_name", "Zwe Pharmacy", commit=False)
            AppSetting.set("pharmacy_name_mm", "ဇွဲ ဆေးဆိုင်", commit=False)
            AppSetting.set("pharmacy_address", "No. 45, Anawrahta Road, Yangon", commit=False)
            AppSetting.set("pharmacy_phone", "09 123 456 789", commit=False)
            AppSetting.set("default_doctor_fee", "5000", commit=False)
            AppSetting.set("default_delivery_fee", "2000", commit=False)

        if Supplier.query.count() == 0:
            for name, person, phone, address in SUPPLIERS:
                db.session.add(Supplier(name=name, contact_person=person, phone=phone, address=address))

        if Medicine.query.count() == 0:
            today = local_today()
            for (name, generic, mm, cat, unit, strip, box, price, cost, stock, days, rx, barcode) in SAMPLE_MEDICINES:
                m = Medicine(
                    name=name, generic_name=generic, name_mm=mm or None, category=cat, unit_name=unit,
                    strip_size=strip[0] if strip else None, strip_price=strip[1] if strip else None,
                    box_size=box[0] if box else None, box_price=box[1] if box else None,
                    selling_price=price, cost_price=cost, stock_quantity=0,
                    requires_prescription=rx, barcode=barcode, reorder_level=10 if stock > 20 else 3,
                )
                db.session.add(m)
                db.session.flush()
                if days > 0 and stock > 40:
                    # two batches: an older one expiring sooner, and a newer one
                    first = stock // 3
                    inventory.add_batch(m, first, today + timedelta(days=max(days // 3, 20)), cost,
                                        batch_number=f"B{m.id:03d}A", reason="opening", user_id=admin.id)
                    inventory.add_batch(m, stock - first, today + timedelta(days=days), cost,
                                        batch_number=f"B{m.id:03d}B", reason="opening", user_id=admin.id)
                else:
                    inventory.add_batch(m, stock, today + timedelta(days=days), cost,
                                        batch_number=f"B{m.id:03d}A", reason="opening", user_id=admin.id)

        if Patient.query.count() == 0:
            for name, gender, phone, address, allergies, limit in PATIENTS:
                p = Patient(name=name, gender=gender, phone=phone, address=address,
                            allergies=allergies, credit_limit=limit)
                db.session.add(p)
                db.session.flush()
                p.patient_number = f"P{p.id:05d}"

        db.session.commit()

        if demo and Sale.query.count() == 0:
            _demo_sales()

        print("Database seeded.")
        for username, password, role, _ in USERS:
            print(f"  {username} / {password}  ({role})")


def _demo_sales():
    """About three weeks of plausible sales so the dashboard has something to show."""
    rng = random.Random(7)
    users = User.query.all()
    medicines = [m for m in Medicine.query.all() if m.name != "Old Stock Test Med"]
    patients = Patient.query.all()
    methods = ["cash"] * 6 + ["kbzpay"] * 3 + ["wavepay"] * 2 + ["ayapay", "cbpay"]
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    for day in range(20, -1, -1):
        for _ in range(rng.randint(4, 12)):
            when = now - timedelta(days=day, hours=rng.randint(0, 10), minutes=rng.randint(0, 59))
            sale = Sale(sale_number=generate_sale_number() + f"{rng.randint(0, 99):02d}",
                        subtotal=0, delivery_fee=0, doctor_fee=0, discount=0,
                        total_amount=0, total_cost=0, total_profit=0,
                        cashier_id=rng.choice(users).id, created_at=when, status="completed")
            patient = rng.choice(patients) if rng.random() < 0.2 else None
            if patient:
                sale.patient_id = patient.id
                sale.doctor_name = "Dr Ye Htut"
                sale.doctor_fee = 5000
                sale.diagnosis = rng.choice(["Common cold", "Fever", "Gastritis", "Hypertension follow-up"])
            db.session.add(sale)
            db.session.flush()
            subtotal = cost_total = 0
            for m in rng.sample(medicines, rng.randint(1, 2)):
                options = m.pack_options()
                opt = rng.choice(options[:2])
                qty = 1
                base = qty * opt["size"]
                try:
                    plan = inventory.allocate_fefo(m, base)
                except inventory.StockError:
                    continue
                cost = sum(float(b.cost_price) * t for b, t in plan)
                total = opt["price"] * qty
                item = SaleItem(sale_id=sale.id, medicine_id=m.id, medicine_name=m.name, quantity=base,
                                cost_price=cost / base, selling_price=total / base, line_total=total,
                                line_profit=total - cost, unit_label=opt["label"], unit_size=opt["size"],
                                unit_qty=qty, unit_price=opt["price"])
                db.session.add(item)
                db.session.flush()
                for b, t in plan:
                    db.session.add(SaleItemBatch(sale_item_id=item.id, batch_id=b.id, quantity=t))
                inventory.take_stock(m, plan, sale.sale_number, sale.cashier_id)
                subtotal += total
                cost_total += cost
            fees = float(sale.doctor_fee or 0)
            sale.subtotal = subtotal
            sale.total_amount = subtotal + fees
            sale.total_cost = cost_total
            sale.total_profit = subtotal - cost_total + fees
            if patient and rng.random() < 0.5:
                sale.payment_method = "credit"
                sale.amount_paid = 0
            else:
                sale.payment_method = rng.choice(methods)
                sale.amount_paid = sale.total_amount
    db.session.flush()
    p = patients[0]
    db.session.add(CreditPayment(patient_id=p.id, amount=5000, payment_method="kbzpay",
                                 reference="KBZ-DEMO-001", note="Part payment", received_by=users[0].id))
    db.session.commit()


if __name__ == "__main__":
    seed(demo="--demo" in sys.argv)
