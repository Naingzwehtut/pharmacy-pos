"""Local business time.

The database stores UTC. The pharmacy works in local time: Myanmar is
UTC+06:30 all year (no daylight saving), so "today", daily totals and date
filters are computed with a fixed offset (``UTC_OFFSET_MINUTES``, default 390).
Without this, sales made between midnight and 06:30 would land on the
previous day in reports.
"""
import os
from datetime import date, datetime, time, timedelta, timezone

from flask import current_app, has_app_context
from sqlalchemy import func, literal_column

DEFAULT_OFFSET_MINUTES = 390  # Asia/Yangon


def offset_minutes():
    if has_app_context():
        return int(current_app.config.get("UTC_OFFSET_MINUTES", DEFAULT_OFFSET_MINUTES))
    return int(os.environ.get("UTC_OFFSET_MINUTES", DEFAULT_OFFSET_MINUTES))


def local_now():
    return datetime.now(timezone.utc) + timedelta(minutes=offset_minutes())


def local_today():
    return local_now().date()


def local_day_bounds(day_start, day_end=None):
    """UTC (naive) [start, end) for local dates day_start..day_end inclusive."""
    day_end = day_end or day_start
    offset = timedelta(minutes=offset_minutes())
    start = datetime.combine(day_start, time.min) - offset
    end = datetime.combine(day_end + timedelta(days=1), time.min) - offset
    return start, end


def local_date_expr(column):
    """SQL expression for the local calendar date of a UTC timestamp column."""
    minutes = offset_minutes()
    from app.models import db

    if db.engine.dialect.name == "sqlite":
        return func.date(column, f"{minutes:+d} minutes")
    return func.date(column + literal_column(f"interval '{minutes} minutes'"))


def parse_date(value):
    """'YYYY-MM-DD' (or a longer ISO string) -> date, or None."""
    if not value:
        return None
    return date.fromisoformat(str(value)[:10])


def iso_utc(dt):
    """ISO string the browser reads as UTC (naive DB values get a 'Z')."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
