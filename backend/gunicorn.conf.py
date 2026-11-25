"""Gunicorn settings. Gunicorn loads this file automatically when it starts in
the backend folder, so the Render start command does not need to change.

The default is 1 worker handling 1 request at a time: if one cashier is
uploading a report, everyone else waits. Most of the time a request is just
waiting on the database or Supabase Storage, so threads help a lot.
"""
import os

# 2 workers x 4 threads = up to 8 requests at once. Fits in the 512 MB of
# Render's free/starter instances. Override with WEB_CONCURRENCY / GUNICORN_THREADS.
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))

# Uploads of up to 10 MB to Supabase Storage on a slow connection need more
# than the default 30 seconds.
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
