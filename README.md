# Pharmacy POS System

A full-stack point-of-sale system for small pharmacies. Built with React (Vite), Flask, and PostgreSQL (Supabase).

## Features

- **JWT authentication** with admin and cashier roles
- **POS cashier interface** — search medicines, cart management, checkout, stock deduction, printable receipts
- **Inventory management** — add, edit, delete medicines with stock, cost/selling price, expiry dates
- **Profit tracking** — historical cost and selling prices stored per sale item
- **Expiry enforcement** — expired medicines blocked at checkout; warnings for items expiring within 30 days
- **Admin dashboard** — sales totals, revenue, profit, charts, low stock and expiry alerts
- **Sales history** — filter by date and sale number, view profit per transaction

## Project Structure

```
pharmacy-pos/
├── backend/          Flask API
├── frontend/         React (Vite) app
└── database/         SQL schema for Supabase
```

## Local Setup

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run `database/schema.sql`
3. Copy your connection string from **Settings → Database**

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env       # edit with your DATABASE_URL and secrets
python seed.py               # create tables + seed data
python run.py                # http://localhost:5000
```

> **Note:** Without `DATABASE_URL` set, the backend uses a local SQLite file (`pharmacy_pos.db`) for development. For production, always use your Supabase PostgreSQL connection string.

Default accounts after seeding:
- **admin** / admin123
- **cashier** / cashier123

### 3. Frontend

```bash
cd frontend
npm install
copy .env.example .env       # set VITE_API_URL=http://localhost:5000/api
npm run dev                  # http://localhost:5173
```

## Deployment

### Backend — Render

1. Create a new **Web Service** connected to this repo
2. Set **Root Directory** to `backend`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `gunicorn run:app --bind 0.0.0.0:$PORT`
5. Add environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase connection string |
| `SECRET_KEY` | Random secret string |
| `JWT_SECRET_KEY` | Random secret string |
| `CORS_ORIGINS` | Your Vercel frontend URL |
| `EXPIRY_WARNING_DAYS` | `30` |

6. After deploy, run seed once via Render Shell: `python seed.py`

### Frontend — Vercel

1. Import the repo, set **Root Directory** to `frontend`
2. **Framework Preset:** Vite
3. Add environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-render-app.onrender.com/api` |

4. Deploy

## API Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/auth/me` | Auth | Current user |
| GET | `/api/medicines` | Auth | List/search medicines |
| POST | `/api/medicines` | Admin | Add medicine |
| PUT | `/api/medicines/:id` | Admin | Update medicine |
| DELETE | `/api/medicines/:id` | Admin | Delete medicine |
| POST | `/api/sales/checkout` | Auth | Complete sale |
| GET | `/api/sales` | Auth | Sales history |
| GET | `/api/dashboard` | Admin | Dashboard stats |

## Tech Stack

- **Frontend:** React 18, Vite, React Router, Recharts
- **Backend:** Flask, Flask-JWT-Extended, SQLAlchemy
- **Database:** PostgreSQL (Supabase)

## 📜 License
This project is licensed under the MIT License.
