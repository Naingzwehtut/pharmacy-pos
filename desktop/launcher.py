"""Zwe Pharmacy desktop app.

Starts the Flask API and the React app on this computer only (127.0.0.1)
and opens them in a window of their own (Microsoft Edge / Chrome "app mode",
which every Windows 10/11 PC has). Closing the window stops the app.

All data lives in %LOCALAPPDATA%\\ZwePharmacy:
    zwe_pharmacy.db   the database (SQLite)
    uploads\\          drug photos and investigation files
    backups\\          automatic daily backups (last 30)
    browser\\          the app window's own browser profile
    zwe_pharmacy.log  log file
"""
import json
import logging
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

APP_NAME = "Zwe Pharmacy"
# Fixed, so the window keeps its language and login between runs (ZWE_PORT only for testing)
PORT = int(os.environ.get("ZWE_PORT", "47231"))


def base_dir():
    """Folder with backend/ and frontend/dist (inside the .exe when frozen)."""
    if getattr(sys, "frozen", False):
        return sys._MEIPASS  # noqa: SLF001 - set by PyInstaller
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def data_dir():
    for arg in sys.argv[1:]:
        if arg.startswith("--data-dir="):
            os.environ["ZWE_DATA_DIR"] = arg.split("=", 1)[1]
    root = os.environ.get("ZWE_DATA_DIR") or os.path.join(
        os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "ZwePharmacy"
    )
    os.makedirs(root, exist_ok=True)
    return root


def load_secrets(root):
    """Random signing keys made once per computer and kept in the data folder."""
    path = os.path.join(root, "secrets.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    keys = {"SECRET_KEY": secrets.token_hex(32), "JWT_SECRET_KEY": secrets.token_hex(32)}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(keys, f)
    return keys


def already_running():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=2) as r:
            return json.load(r).get("app") == "zwe-pharmacy"
    except Exception:
        return False


def port_free():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", PORT)) != 0


def find_browser():
    candidates = []
    for env in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        base = os.environ.get(env)
        if base:
            candidates += [
                os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
            ]
    for name in ("msedge", "chrome", "google-chrome", "chromium"):
        found = shutil.which(name)
        if found:
            candidates.append(found)
    return next((c for c in candidates if c and os.path.exists(c)), None)


def open_window(url, root):
    """Open the app window and return the process (or None if only a normal tab could open)."""
    browser = find_browser()
    if browser:
        profile = os.path.join(root, "browser")
        args = [
            browser,
            f"--app={url}",
            f"--user-data-dir={profile}",  # own profile: the process stays until the window closes
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=Translate",
            "--window-size=1366,860",
        ]
        flags = subprocess.CREATE_NO_WINDOW if sys.platform.startswith("win") else 0
        return subprocess.Popen(args, creationflags=flags)
    webbrowser.open(url)
    return None


def start_server(log):
    root = data_dir()
    db_file = os.path.join(root, "zwe_pharmacy.db")
    uploads = os.path.join(root, "uploads")
    keys = load_secrets(root)

    os.environ.update({
        "ZWE_DESKTOP": "1",
        "ZWE_DATA_DIR": root,
        "ZWE_FRONTEND_DIST": os.path.join(base_dir(), "frontend", "dist"),
        "DATABASE_URL": "sqlite:///" + db_file.replace("\\", "/"),
        "UPLOAD_FOLDER": uploads,
        "SECRET_KEY": keys["SECRET_KEY"],
        "JWT_SECRET_KEY": keys["JWT_SECRET_KEY"],
        "CORS_ORIGINS": f"http://127.0.0.1:{PORT}",
    })
    sys.path.insert(0, os.path.join(base_dir(), "backend"))

    from app.backup import apply_pending_restore

    apply_pending_restore(root, db_file, uploads, log=log.info)

    from app import create_app
    from app.migrations import upgrade_database

    app = create_app()
    with app.app_context():
        upgrade_database(log=log.info)  # creates tables on first run, upgrades after updates

    from waitress import serve

    threading.Thread(
        target=serve, args=(app,), kwargs={"host": "127.0.0.1", "port": PORT, "threads": 8},
        daemon=True,
    ).start()
    threading.Thread(target=backup_loop, args=(app, log), daemon=True).start()
    return app


def backup_loop(app, log):
    from app.backup import auto_backup_if_due
    from app.models import User

    time.sleep(20)
    while True:
        try:
            with app.app_context():
                if User.query.count() > 0:
                    name = auto_backup_if_due(hours=24)
                    if name:
                        log.info("Automatic backup %s", name)
        except Exception:
            log.exception("Automatic backup failed")
        time.sleep(3600)


def wait_until_up(seconds=30):
    end = time.time() + seconds
    while time.time() < end:
        if already_running():
            return True
        time.sleep(0.2)
    return False


def main():
    root = data_dir()
    logging.basicConfig(
        filename=os.path.join(root, "zwe_pharmacy.log"),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    log = logging.getLogger("zwe")
    url = f"http://127.0.0.1:{PORT}/"

    if already_running():  # second click on the icon: just open another window
        open_window(url, root)
        return
    if not port_free():
        log.error("Port %s is used by another program", PORT)
        show_error(f"{APP_NAME} cannot start: port {PORT} is used by another program.")
        return

    try:
        start_server(log)
    except Exception as e:
        log.exception("Could not start")
        show_error(f"{APP_NAME} could not start:\n{e}\n\nDetails are in {os.path.join(root, 'zwe_pharmacy.log')}")
        return

    if "--server-only" in sys.argv:  # for testing: no window, run until stopped
        log.info("Server only on %s", url)
        while True:
            time.sleep(3600)

    if not wait_until_up():
        show_error(f"{APP_NAME} did not start in time. See {os.path.join(root, 'zwe_pharmacy.log')}")
        return

    window = open_window(url, root)
    log.info("Started, window: %s", "app" if window else "default browser")
    if window is not None:
        wait_for_window_closed(window, os.path.join(root, "browser"), log)
    else:
        keep_alive_dialog(url)


def wait_for_window_closed(window, profile, log, grace=30):
    """Return when the user has closed the app window.

    The browser process we start may exit at once: on the very first run Edge
    restarts itself with the new profile, and if a window of this app is
    already open it hands over to it. So the browser profile being in use is
    what counts, with a grace period for the window to appear.
    """
    started = time.time()
    last_seen = started
    while True:
        if window.poll() is None or profile_in_use(profile):
            last_seen = time.time()
        elif time.time() - started > grace and time.time() - last_seen > 5:
            log.info("Window closed")
            return
        time.sleep(1)


def profile_in_use(profile):
    """Chromium keeps `lockfile` open while a window uses the profile (Windows)."""
    lock = os.path.join(profile, "lockfile")
    if not os.path.exists(lock):
        return False
    try:
        os.remove(lock)
        return False
    except OSError:
        return True


def show_error(message):
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, APP_NAME, 0x10)
    except Exception:
        print(message)


def keep_alive_dialog(url):
    """No Edge/Chrome found: the app opened in the default browser, so keep a small window to stop it."""
    try:
        import tkinter as tk

        win = tk.Tk()
        win.title(APP_NAME)
        tk.Label(win, text=f"{APP_NAME} is running.\n{url}\n\nClose this window to stop it.", padx=24, pady=18).pack()
        win.mainloop()
    except Exception:
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()
