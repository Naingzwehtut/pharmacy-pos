# Zwe Pharmacy — v2

**Zwe Pharmacy (ဇွဲ ဆေးဆိုင်)** is a full-stack point-of-sale, inventory and patient-management system built for **Myanmar pharmacies and small clinics**. Sell by tablet, strip (ကတ်) or box (ဗူး), take KBZPay / WavePay / AYA Pay or credit (အကြွေး), track every batch's expiry date, and run the whole shop in **Myanmar or English**.

ဇွဲ ဆေးဆိုင် — ဆေးဆိုင်နှင့် ဆေးခန်းများအတွက် အရောင်း၊ ဆေးစာရင်း၊ လူနာမှတ်တမ်း စနစ် — မြန်မာ/အင်္ဂလိပ် နှစ်ဘာသာ။

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC)
![License](https://img.shields.io/badge/License-MIT-green)

> **This is the `v2` branch.** The original version is unchanged on `main`. To move an existing v1 database to v2, see [Upgrading from v1](#upgrading-from-v1).

## Contents

- [What's new in v2](#whats-new-in-v2)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Upgrading from v1](#upgrading-from-v1)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Roles and permissions](#roles-and-permissions)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## What's new in v2

| Area | v2 |
|------|----|
| Language | Full **Myanmar / English** interface, switchable per user. Receipts in Myanmar, English or both, with optional Myanmar digits (၁၂၃). |
| Selling units | Each medicine has a base unit (tablet, capsule, bottle…) plus optional **strip** and **box** sizes and prices. Stock is counted in base units and shown as “3 strip + 4 tablet”. |
| Batches & expiry | Stock is stored in **batches**, each with its own expiry date and cost. Sales take stock **first-expiry-first-out** and never from an expired batch. |
| Receive stock | Goods-received notes with supplier, invoice number, batch number, expiry and cost per pack. Supplier list. |
| Payments | Cash (with cash-received and change), **KBZPay, WavePay, AYA Pay, CB Pay, UAB Pay**, MPU/card, bank transfer, and **credit (အကြွေး)**. Transaction IDs are saved. |
| Credit accounts | Sell on credit to a registered customer, with an optional credit limit and a part-payment at the till. Statements and repayments. |
| Discounts | Amount or %. Cashiers are limited to a maximum % set by the admin. |
| Void sales | Admins can void a sale with a reason. Stock goes back to the exact batches it came from; voided sales leave all reports. |
| Stock adjustments | Damaged, expired, lost, count correction, returned to supplier — each with a full audit trail of who changed what. |
| Reports | **Daily closing** (cash in drawer, totals per payment method, credit given and repaid, per cashier, top items) and an **expiry report**. CSV export of sales (opens correctly in Excel with Myanmar text). |
| Dashboard | Today vs yesterday, this month, stock value, outstanding credit, low stock by reorder level, expiring batches, payments by method. |
| Users | User management screen, a new **pharmacist** role, change password, deactivate accounts (takes effect immediately). Cashiers no longer see cost or profit. |
| Myanmar time | “Today”, daily totals and date filters use Myanmar time (UTC+06:30), so late-night and early-morning sales land on the right day. |
| Look | A plain, work-focused design: light sidebar grouped into Shop / Stock / Office, flat tables, IBM Plex Sans with Noto Sans Myanmar. |
| Till speed | Barcode scanner support, F2 to search, Enter to add, F9 to check out. The cart survives a page reload or power cut. Works on phones and tablets. |
| Quality | Automated backend test suite (`pytest`). Dashboard code is loaded only when needed, so the till loads faster on slow connections. |

## Features

**Point of sale**
- Search by brand name, generic name, Myanmar name or category; scan a barcode to add instantly
- Sell by unit, strip or box with separate prices; quantity limits follow sellable (non-expired) stock
- Prescription (Rx) medicines are flagged with a reminder to check the prescription
- Doctor fee, delivery fee (with customer name, phone and address), discount
- Cash received with quick-cash buttons and change; mobile-wallet transaction IDs; credit with part-payment
- Printable receipts for 80 mm or 58 mm thermal printers or A5 paper

**Clinic and patient records** (from v1, extended)
- Patient / customer records with automatic ID (`P00001`), phone, NRC (optional), allergies, medical notes, credit limit
- Visit at the till: doctor, symptoms, diagnosis, notes and dosage for every medicine
- Allergy warning whenever a patient is selected; current credit balance shown at the till
- Investigation results (blood reports, X-rays, PDFs) in a private Supabase Storage bucket
- Visit and purchase history, credit statement and repayments per patient

**Inventory**
- Brand, generic and Myanmar names, category, manufacturer, barcode, shelf location, reorder level, active/inactive
- Batches with expiry, quantity and cost; edit a batch's expiry or number; stock adjustments with reasons
- Stock movement history for every medicine (sales, purchases, adjustments, voids)
- Filters: low stock, expiring soon, has expired stock, inactive

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router 6, Recharts, Vite 5 |
| Backend | Python, Flask 3, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS, Gunicorn |
| Database | PostgreSQL (Supabase) in production, SQLite for local development |
| Hosting | Vercel (frontend), Render (backend), Supabase (database and file storage) |

```
 Browser  ──►  React app (Vercel)  ──►  Flask REST API (Render)  ──►  PostgreSQL (Supabase)
```

## Getting started

Prerequisites: Node.js 18+, Python 3.10+.

```bash
git clone https://github.com/Naingzwehtut/pharmacy-pos.git
cd pharmacy-pos
git checkout v2
```

### Backend

```bash
cd backend
python -m venv .venv
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements-dev.txt
python seed.py --demo   # tables, sample Myanmar pharmacy data and ~3 weeks of demo sales
python run.py           # API on http://localhost:5000
```

Leave out `--demo` for sample medicines and users without sales. With no configuration the backend uses a local SQLite file (`backend/instance/pharmacy_pos.db`).

`seed.py` creates these accounts **for local development only**:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `pharmacist` | `pharma123` | pharmacist |
| `cashier` | `cashier123` | cashier |

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

### Tests

```bash
cd backend
python -m pytest
```

The tests cover FEFO batch selection, unit/strip/box pricing, cost and profit, expired stock, discounts and the cashier limit, credit limits and repayments, voids, purchases, stock adjustments, user deactivation, settings, pagination, CSV export, the dashboard and reports.

## Upgrading from v1

`upgrade_db.py` moves a v1 (or clinic-version) database to v2. It adds the new tables and columns and turns each medicine's current stock into an “OPENING” batch with its existing expiry date. It never deletes data and is safe to run more than once.

1. **Back up the database first** (Supabase: Database → Backups, or `pg_dump`).
2. Run the upgrade against the production database:

   ```bash
   cd backend
   export DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres"
   python upgrade_db.py
   ```

3. Deploy the `v2` branch to Render and Vercel (change the deployed branch in each service's settings).
4. Recommended: enable row-level security on the new tables (see [Database](#1-database-supabase)).

Old sales keep their history. They show as cash sales, can be reprinted, and can be voided (stock returns to the newest batch).

## Configuration

### Backend (environment variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | In production | PostgreSQL connection string. Defaults to a local SQLite file. |
| `SECRET_KEY` | In production | Flask secret key. Use a long random value. |
| `JWT_SECRET_KEY` | In production | Key used to sign login tokens. Use a different long random value. |
| `CORS_ORIGINS` | In production | Comma-separated allowed frontend origins, e.g. `https://your-app.vercel.app`. No trailing slash. |
| `UTC_OFFSET_MINUTES` | No | Local business time offset from UTC. Default `390` (Myanmar, UTC+06:30). |
| `EXPIRY_WARNING_DAYS` | No | Days before expiry at which a batch is flagged. Default `30`. |
| `SUPABASE_URL` | In production | Supabase project URL, for investigation uploads. |
| `SUPABASE_SERVICE_KEY` | In production | Supabase **secret** (service_role) key. Backend only. |
| `SUPABASE_BUCKET` | No | Storage bucket for investigation files. Default `investigations`. |
| `MAX_UPLOAD_MB` | No | Largest upload. Default `10`. |

Generate a secret with `python -c "import secrets; print(secrets.token_hex(32))"`.

### In-app settings (admin → Settings)

Pharmacy name in English and Myanmar, address, phone, receipt footer in both languages, receipt language, Myanmar digits, paper size (80 mm / 58 mm / A5), currency label (`Ks`, `ကျပ်`, `MMK`…), default doctor and delivery fees, the maximum cashier discount, and which payment methods appear at the till. A live receipt preview shows the result.

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the API **including `/api`**, e.g. `https://your-api.onrender.com/api`. Built into the app, so redeploy after changing it. |

## Deployment

The app is designed for Supabase (database), Render (API) and Vercel (frontend). Set them up in this order.

### 1. Database (Supabase)

1. Create a Supabase project and copy the **Session pooler** connection string (Render needs IPv4).
2. From your computer, create the tables: `cd backend`, set `DATABASE_URL`, then `python upgrade_db.py`.
3. Create your own admin account. Generate a password hash:

   ```bash
   python -c "from werkzeug.security import generate_password_hash as g; print(g('choose-a-strong-password'))"
   ```

   Then in the Supabase SQL Editor (paste the **whole** hash, starting with `scrypt:`):

   ```sql
   INSERT INTO users (username, password_hash, role, is_active, created_at)
   VALUES ('admin', 'PASTE_THE_FULL_HASH_HERE', 'admin', true, now());
   ```

   After that, create other staff accounts from the **Users** screen.
4. Recommended: protect the tables from Supabase's public API (the backend connects as the owner and is not affected):

   ```sql
   ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
   ALTER TABLE medicines              ENABLE ROW LEVEL SECURITY;
   ALTER TABLE medicine_batches       ENABLE ROW LEVEL SECURITY;
   ALTER TABLE suppliers              ENABLE ROW LEVEL SECURITY;
   ALTER TABLE purchases              ENABLE ROW LEVEL SECURITY;
   ALTER TABLE stock_movements        ENABLE ROW LEVEL SECURITY;
   ALTER TABLE patients               ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sales                  ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sale_items             ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sale_item_batches      ENABLE ROW LEVEL SECURITY;
   ALTER TABLE credit_payments        ENABLE ROW LEVEL SECURITY;
   ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;
   ALTER TABLE patient_investigations ENABLE ROW LEVEL SECURITY;
   ```

5. Create a **private** Storage bucket named `investigations` and copy the secret key for `SUPABASE_SERVICE_KEY`.

### 2. Backend (Render)

| Setting | Value |
|---------|-------|
| Branch | `v2` |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn run:app --bind 0.0.0.0:$PORT` |

Add `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `CORS_ORIGINS`. Check that `/api/health` returns `{"status":"ok","version":"2.0.0"}`.

### 3. Frontend (Vercel)

| Setting | Value |
|---------|-------|
| Branch | `v2` |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Environment variable | `VITE_API_URL` = `https://<your-service>.onrender.com/api` |

Then add the Vercel address to `CORS_ORIGINS` on Render.

> **Free-plan note:** a free Render service sleeps after ~15 minutes without traffic; the first request afterwards can take up to a minute.

## Roles and permissions

| Capability | Admin | Pharmacist | Cashier |
|------------|:-----:|:----------:|:-------:|
| Point of sale, patients, record visits | ✓ | ✓ | ✓ |
| Receive credit repayments | ✓ | ✓ | ✓ |
| Sales history and receipts | ✓ | ✓ | ✓ |
| Daily closing report | All staff | All staff | Own sales only |
| See cost and profit | ✓ | — | — |
| Discount above the cashier limit | ✓ | ✓ | — |
| Inventory, batches, adjustments | ✓ | ✓ | — |
| Receive stock, suppliers, expiry report | ✓ | ✓ | — |
| Delete medicines, suppliers, patients | ✓ | — | — |
| Void a sale | ✓ | — | — |
| Dashboard, users, settings, CSV export | ✓ | — | — |

## API overview

All endpoints are under `/api` and need `Authorization: Bearer <token>`, except login and health.

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/auth/login` · `/auth/change-password` | Public · User | Sign in · change own password |
| `GET` `POST` `PUT` | `/users`, `/users/<id>` | Admin | List, create, update (role, active, password) |
| `GET` | `/medicines` | User | Search (`search`, `pos`, `status=low\|expiring\|expired\|inactive`, `include_expired`, `added_date`, `limit`) |
| `GET` | `/medicines/barcode/<code>` | User | Find by barcode |
| `POST` `PUT` `DELETE` | `/medicines`, `/medicines/<id>` | Admin, pharmacist (delete: admin) | Create (with optional opening batch), update, delete |
| `GET` `PUT` | `/medicines/<id>/batches[/<batch_id>]` | User · Admin, pharmacist | Batches; correct batch number, expiry or cost |
| `POST` | `/medicines/<id>/adjust` | Admin, pharmacist | `{change, reason, batch_id?, expiry_date?, note?}` |
| `GET` | `/medicines/movements` | Admin, pharmacist | Stock audit trail |
| `GET` `POST` `PUT` `DELETE` | `/suppliers` | Admin, pharmacist | Suppliers |
| `GET` `POST` | `/purchases` | Admin, pharmacist | Received stock; each line creates a batch |
| `POST` | `/sales/checkout` | User | Sale or visit (see below) |
| `GET` | `/sales` | User | `start_date`, `end_date` (Myanmar dates), `sale_number`, `payment_method`, `status`, `patient_id`, `page`, `per_page` |
| `POST` | `/sales/<id>/void` | Admin | `{reason}` — returns stock to its batches |
| `GET` | `/sales/export.csv` | Admin | Same filters as `/sales` |
| `GET` | `/credit/accounts[/<patient_id>]` | User | Balances · statement |
| `POST` | `/credit/accounts/<patient_id>/payments` | User | Record a repayment |
| `GET` | `/reports/daily` · `/reports/expiry` | User · Admin, pharmacist | Daily closing · expiring and expired batches |
| `GET` | `/dashboard`, `/dashboard/calendar` | Admin | Statistics |
| `GET` `PUT` | `/settings` | Read: user, write: admin | All shop settings |
| | `/patients…` | | As in v1, plus `nrc_number`, `credit_limit` and `balance` |

Example checkout — two strips on credit with a part payment:

```json
POST /api/sales/checkout
{
  "patient_id": 2,
  "items": [{ "medicine_id": 9, "unit": "strip", "quantity": 2, "dosage": "1 tablet at night, 7 days" }],
  "doctor_fee": 5000,
  "discount": 500,
  "payment_method": "credit",
  "amount_paid": 2000
}
```

A checkout is all-or-nothing: if anything is invalid, nothing is saved and no stock changes.

## Project structure

```
pharmacy-pos/
├── backend/
│   ├── app/
│   │   ├── __init__.py      # app factory, JWT user loading
│   │   ├── models.py        # users, medicines, batches, suppliers, purchases, stock movements,
│   │   │                    # patients, sales, sale items, credit payments, investigations
│   │   ├── inventory.py     # stock rules: batches, FEFO, adjustments, voids
│   │   ├── credit.py        # credit balances
│   │   ├── timeutil.py      # Myanmar local time
│   │   ├── utils.py         # roles, numbers, validation
│   │   ├── storage.py       # investigation files (Supabase Storage / local disk)
│   │   └── routes/          # auth, users, medicines, purchases, sales, credit,
│   │                        # reports, dashboard, settings, patients
│   ├── tests/               # pytest suite
│   ├── seed.py              # sample data (--demo for sales)
│   └── upgrade_db.py        # create / upgrade tables, v1 → v2
└── frontend/
    └── src/
        ├── i18n.jsx         # Myanmar / English text
        ├── format.js        # Kyat amounts, Myanmar digits, dates, units
        ├── context/         # auth, settings
        ├── components/      # Layout, Receipt, PatientPicker, shared UI...
        └── pages/           # POS, Inventory, Purchases, Credit, SalesHistory,
                             # Reports, Dashboard, Patients, Users, Settings...
```

## Security notes

- Change or delete the sample accounts before any real use, and set strong `SECRET_KEY` and `JWT_SECRET_KEY` values.
- Deactivating a user blocks them immediately, even if they are still signed in.
- Patient records are sensitive personal data. Use HTTPS only, limit accounts, enable row-level security, and keep backups.
- The allergy warning and Rx flag only show what staff recorded. The software does not check drug interactions or give clinical advice, and it is not a certified medical device.

## Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| CORS error on every request | `CORS_ORIGINS` does not match the frontend address exactly (no trailing slash). |
| Requests go to `/auth/login` instead of `/api/auth/login` | `VITE_API_URL` is missing `/api`. Fix it and redeploy the frontend. |
| `no such column` / `relation … does not exist` | The database is older than the code. Run `python upgrade_db.py`. |
| Login returns HTTP 500 | The stored password hash is malformed; it must start with `scrypt:`. |
| Myanmar text shows as boxes | The device has no Myanmar Unicode font. The app loads Noto Sans Myanmar from Google Fonts; check the internet connection. Zawgyi-encoded text must be converted to Unicode. |
| Daily totals look shifted by a day | Check `UTC_OFFSET_MINUTES` (390 for Myanmar). |
| First request takes up to a minute | The free Render service was asleep. |

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Naing Zwe Htut.
