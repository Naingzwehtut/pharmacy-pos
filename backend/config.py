import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-dev-secret-change-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    if not SQLALCHEMY_DATABASE_URI:
        # Local dev fallback when Supabase/PostgreSQL is not configured
        SQLALCHEMY_DATABASE_URI = "sqlite:///pharmacy_pos.db"
    # # Render/Heroku use postgres:// — SQLAlchemy needs postgresql://
    # if SQLALCHEMY_DATABASE_URI and SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
    #     SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
    #         "postgres://", "postgresql://", 1
    #     )
    
    # Render/Heroku/Supabase give postgres:// or postgresql://. Always use the
    # psycopg2 driver we install (SQLAlchemy 2.1 changed the default to psycopg v3).
    for _prefix in ("postgres://", "postgresql://"):
        if SQLALCHEMY_DATABASE_URI.startswith(_prefix):
            SQLALCHEMY_DATABASE_URI = (
                "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URI[len(_prefix):]
            )
            break

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Investigation files (blood reports, X-rays...) go to a PRIVATE Supabase
    # Storage bucket. Use the service-role / secret key; never expose it to the frontend.
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
    SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "investigations")
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "10"))
    # Reject larger request bodies before they are read (a little room for form fields)
    MAX_CONTENT_LENGTH = (MAX_UPLOAD_MB + 1) * 1024 * 1024
    # Without Supabase, files are saved on local disk, but only for local
    # development (SQLite). On Render the disk is wiped on every deploy.
    UPLOAD_FOLDER = os.environ.get(
        "UPLOAD_FOLDER", os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    )
    ALLOW_LOCAL_UPLOADS = SQLALCHEMY_DATABASE_URI.startswith("sqlite")
    EXPIRY_WARNING_DAYS = int(os.environ.get("EXPIRY_WARNING_DAYS", "30"))
    # Local business time. Myanmar (Asia/Yangon) is UTC+06:30 all year.
    UTC_OFFSET_MINUTES = int(os.environ.get("UTC_OFFSET_MINUTES", "390"))
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
