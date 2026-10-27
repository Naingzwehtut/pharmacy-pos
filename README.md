# Pharmacy & Clinic POS

A full-stack point-of-sale and patient-management system for pharmacies and small clinics. Sell medicines, record patient visits with doctor fees and dosage instructions, keep stock accurate automatically, and see sales and profit at a glance.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Roles and permissions](#roles-and-permissions)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Known limitations and roadmap](#known-limitations-and-roadmap)
- [License](#license)

## Features

**Point of sale**
- Fast medicine search by name or category, with a live cart and automatic totals
- Expired medicines cannot be sold, and sales cannot exceed available stock
- Optional delivery orders with a configurable default delivery fee (customer name and address required)
- Printable receipts (80 mm thermal-printer layout) with your pharmacy name, address and phone
- Each sale stores the cost and selling price at the time of sale, so profit reports stay correct when prices change

**Clinic and patient records**
- Patient records with an automatic ID (`P00001`), contact details, date of birth, allergies and medical notes
- Record a visit at the till: doctor, symptoms, diagnosis, notes, and a dosage instruction for every medicine
- Doctor (consultation) fee with a configurable default; consultation-only visits are supported
- Medicines given to a patient are deducted from pharmacy stock in the same transaction as the visit
- Allergy warning shown whenever a patient is selected
- Full visit history per patient, with diagnosis, medicines, dosage, fees and reprintable receipts

**Inventory**
- Add, edit and delete medicines, search, and filter by the date added
- Expiry status (OK, expiring soon, expired) with a configurable warning window
- Low-stock badges, and protection against deleting medicines that have sales history

**Reporting (admin)**
- Dashboard with revenue, profit, expenses, product, patient and doctor-fee totals
- Daily revenue calendar with items sold, revenue and profit per day
- Revenue and profit chart for the last 14 days, and best-selling medicines
- Alerts for low stock, medicines expiring soon, and expired medicines
- Sales history with filters by date range and sale number, and per-line cost and profit

**Access control**
- JWT authentication with 8-hour sessions and hashed passwords
- Two roles, admin and cashier, enforced on both the API and the interface

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router 6, Recharts, Vite 5 |
| Backend | Python, Flask 3, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS, Gunicorn |
| Database | PostgreSQL (Supabase) in production, SQLite for local development |
| Hosting | Vercel (frontend), Render (backend), Supabase (database) |

```
 Browser  ──►  React app (Vercel)  ──►  Flask REST API (Render)  ──►  PostgreSQL (Supabase)
```

## Getting started

### Prerequisites

- Node.js 18 or newer
- Python 3.10 or newer (tested on 3.12 and 3.13, deployed on 3.14)

### 1. Clone

```bash
git clone https://github.com/<your-username>/pharmacy-pos.git
cd pharmacy-pos
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python seed.py      # creates the tables, sample medicines and two sample users
python run.py       # API on http://localhost:5000
```

With no configuration the backend uses a local SQLite database (`instance/pharmacy_pos.db`), so nothing else is needed to try the app.

`seed.py` creates these accounts **for local development only**:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `12345678` | admin |
| `cashier` | `cashier123` | cashier |

Never use these accounts on a deployed system. See [Production database setup](#1-database-supabase).

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

The frontend calls `http://localhost:5000/api` by default. Open http://localhost:5173 and sign in.

### Using PostgreSQL locally

Set `DATABASE_URL` as a real environment variable before running `seed.py` or `run.py`. The app does not read a `.env` file by itself.

```bash
# macOS / Linux
export DATABASE_URL="postgresql://user:password@localhost:5432/pharmacy"
# Windows (PowerShell)
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/pharmacy"
```

### Upgrading an existing database

If you already have data from an older version, run this once. It creates any missing tables (such as `patients`) and adds any missing columns, and it never deletes data. It is safe to run more than once.

```bash
cd backend
python upgrade_db.py
```

## Configuration

### Backend (environment variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | In production | PostgreSQL connection string. Defaults to a local SQLite file. |
| `SECRET_KEY` | In production | Flask secret key. Use a long random value. |
| `JWT_SECRET_KEY` | In production | Key used to sign login tokens. Use a different long random value. |
| `CORS_ORIGINS` | In production | Comma-separated list of allowed frontend origins, for example `https://your-app.vercel.app`. No trailing slash and no spaces. Defaults to `http://localhost:5173`. |
| `EXPIRY_WARNING_DAYS` | No | Days before expiry at which a medicine is flagged. Default `30`. |

`backend/.env.example` lists these names. Generate a secret with `python -c "import secrets; print(secrets.token_hex(32))"`.

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the API, **including `/api`**, for example `https://your-api.onrender.com/api`. It is built into the app, so redeploy after changing it. |

## Deployment

The app is designed for Supabase (database), Render (API) and Vercel (frontend). Set them up in this order.

### 1. Database (Supabase)

1. Create a Supabase project.
2. Open **Connect** and copy the **Session pooler** connection string. Use the pooler, because the direct connection is IPv6-only and Render needs IPv4.
3. From your computer, create the tables:

   ```bash
   cd backend
   export DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres"
   python upgrade_db.py
   ```

4. Create your own admin account instead of using the sample users. Generate a password hash:

   ```bash
   python -c "from werkzeug.security import generate_password_hash as g; print(g('choose-a-strong-password'))"
   ```

   Then run this in the Supabase SQL Editor, pasting the **whole** hash. It starts with `scrypt:`:

   ```sql
   INSERT INTO users (username, password_hash, role, created_at)
   VALUES ('admin', 'PASTE_THE_FULL_HASH_HERE', 'admin', now());
   ```

5. Recommended: protect the tables from Supabase's public API. The backend connects as the table owner, so it is not affected.

   ```sql
   ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
   ALTER TABLE medicines  ENABLE ROW LEVEL SECURITY;
   ALTER TABLE patients   ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
   ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
   ```

### 2. Backend (Render)

Create a **Web Service** from this repository:

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn run:app --bind 0.0.0.0:$PORT` |

Add the environment variables `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY` and `CORS_ORIGINS` (set `CORS_ORIGINS` to your Vercel address once you have it). Check that `https://<your-service>.onrender.com/api/health` returns `{"status":"ok"}`.

### 3. Frontend (Vercel)

Import the repository as a new project:

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Environment variable | `VITE_API_URL` = `https://<your-service>.onrender.com/api` |

Deploy, then add the Vercel address to `CORS_ORIGINS` on Render. Vercel may warn that `VITE_` variables are public. That is expected here, because the value is only your API address and contains no secret.

> **Free-plan note:** a free Render service sleeps after about 15 minutes without traffic, and the first request afterwards can take up to a minute.

## Roles and permissions

| Capability | Admin | Cashier |
|------------|:-----:|:-------:|
| Point of sale and checkout | Yes | Yes |
| View, add and edit patients, record visits | Yes | Yes |
| View sales history and reprint receipts | Yes | Yes |
| Delete a patient (only if they have no visits) | Yes | No |
| Add, edit and delete medicines (Inventory) | Yes | No |
| Dashboard and revenue calendar | Yes | No |
| Change receipt details and default fees | Yes | No |

## API overview

All endpoints are under `/api`. Everything except login and health requires a `Authorization: Bearer <token>` header.

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/health` | Public | Service status |
| `POST` | `/auth/login` | Public | Sign in and receive a token |
| `GET` | `/auth/me` | User | Current user |
| `GET` | `/medicines` | User | List and search (`search`, `category`, `pos`, `include_expired`, `added_date`) |
| `GET` | `/medicines/categories` | User | List categories |
| `GET` | `/medicines/<id>` | User | One medicine |
| `POST` `PUT` `DELETE` | `/medicines`, `/medicines/<id>` | Admin | Create, update, delete |
| `GET` | `/patients` | User | List and search (`search`, `limit`) with visit counts |
| `POST` | `/patients` | User | Register a patient |
| `GET` | `/patients/<id>` | User | Patient with full visit history and totals |
| `PUT` | `/patients/<id>` | User | Update a patient |
| `DELETE` | `/patients/<id>` | Admin | Delete a patient with no visits |
| `GET` | `/sales` | User | List sales (`start_date`, `end_date`, `sale_number`, `patient_id`) |
| `GET` | `/sales/<id>` | User | One sale |
| `POST` | `/sales/checkout` | User | Complete a sale or patient visit and deduct stock |
| `GET` | `/dashboard`, `/dashboard/calendar` | Admin | Statistics and daily revenue |
| `GET` `PUT` | `/settings/receipt`, `/settings/delivery-fee`, `/settings/doctor-fee` | Read: user, write: admin | Receipt details and default fees |

Example checkout for a patient visit:

```json
POST /api/sales/checkout
{
  "patient_id": 2,
  "doctor_name": "Dr. Su Mon",
  "doctor_fee": 5000,
  "symptoms": "Sneezing and itchy eyes",
  "diagnosis": "Allergic rhinitis",
  "items": [
    { "medicine_id": 9, "quantity": 7, "dosage": "1 tablet at night, 7 days" }
  ]
}
```

A checkout is all-or-nothing: if any medicine is expired or short of stock, nothing is saved and no stock changes.

## Project structure

```
pharmacy-pos/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # app factory and blueprint registration
│   │   ├── models.py            # User, Medicine, Patient, Sale, SaleItem, AppSetting
│   │   ├── utils.py             # admin_required, sale numbers, stock validation
│   │   └── routes/              # auth, medicines, patients, sales, dashboard, settings
│   ├── config.py                # configuration from environment variables
│   ├── run.py                   # entry point (gunicorn run:app)
│   ├── seed.py                  # sample users, medicines and patient
│   ├── upgrade_db.py            # create or upgrade tables on an existing database
│   ├── requirements.txt
│   ├── Procfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/          # Layout, PatientForm, PatientPicker, Receipt, ReceiptModal
│   │   ├── context/             # AuthContext
│   │   ├── pages/               # Login, POS, Patients, PatientDetail, Inventory,
│   │   │                        # Dashboard, Calendar, SalesHistory
│   │   ├── styles/index.css
│   │   ├── api.js               # API client
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vercel.json              # single-page-app rewrites
│   ├── vite.config.js
│   └── package.json
├── LICENSE
└── README.md
```

## Security notes

- Change or delete the sample `admin` and `cashier` accounts before any real use.
- Set strong, unique `SECRET_KEY` and `JWT_SECRET_KEY` values. The built-in defaults are for development only.
- Never commit `.env` files, database passwords or password hashes.
- Patient records are sensitive personal data. Use HTTPS only, limit who receives accounts, enable row-level security on your Supabase tables, and keep database backups.
- The allergy warning only displays what staff have recorded. The software does not check drug interactions or give clinical advice, and it is not a certified medical device.

## Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Browser shows a CORS error on every request | `CORS_ORIGINS` on the backend does not match the frontend's exact address (no trailing slash). Fix it and let the service restart. |
| Requests go to `/auth/login` instead of `/api/auth/login` | `VITE_API_URL` is missing `/api` at the end. Fix it and **redeploy** the frontend. |
| A CORS error on only one page, others work | The request probably timed out or crashed on the server. Check the backend logs for `WORKER TIMEOUT` or a Python error. |
| Login returns HTTP 500 | The stored password hash is malformed. It must be the full output of `generate_password_hash`, starting with `scrypt:`. |
| Backend fails to start with `No module named 'psycopg'` | Keep `SQLAlchemy<2.1` in `requirements.txt` and the explicit `postgresql+psycopg2` driver selection in `config.py`. |
| First request after a while takes up to a minute | The free Render service was asleep. Wait and retry. |
| `relation "patients" does not exist` or a missing column | The database is from an older version. Run `python upgrade_db.py`. |

## Known limitations and roadmap

Current limitations:
- A completed sale or visit cannot be voided or refunded in the app. An admin must correct stock in Inventory.
- There is no user-management screen. Accounts are created with `seed.py` or SQL.
- Currency symbols are hard-coded (`MMK` at the till and `$` on receipts and history).
- The sales history shows the 500 most recent sales and has no pagination.
- There is no automated test suite yet.

Ideas for future work: void and refund of visits, user management and a doctor role, a currency setting, pagination, and automated tests.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Naing Zwe Htut.
