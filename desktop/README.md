# Zwe Pharmacy — Desktop app (Windows)

The desktop app is the same Zwe Pharmacy, running entirely on one Windows computer:

- **Works without internet.** No Supabase, no Render, no monthly hosting.
- **All data stays on the computer** in `%LOCALAPPDATA%\ZwePharmacy`.
- **Automatic daily backups**, plus “Back up now”, restore, and a second copy to a USB drive or Google Drive folder.
- Opens in its own window (it uses Microsoft Edge, which every Windows 10/11 PC has). Closing the window stops the app.

## Install

1. Copy `ZwePharmacy.exe` to the shop computer, for example into `C:\ZwePharmacy\`.
2. Right-click it → **Send to → Desktop (create shortcut)**.
3. Double-click to open. The first time, Windows SmartScreen may say “Windows protected your PC” because the app is not code-signed: click **More info → Run anyway**.
4. Choose one of the two first-run options:
   - **Start a new shop**: enter the pharmacy name and create the owner (admin) account.
   - **Move data from the cloud**: copy everything from your current Supabase database (see below).

Optional installer with Start-menu and desktop shortcuts: build `ZwePharmacy.exe`, install [Inno Setup 6](https://jrsoftware.org/isinfo.php), open `desktop\installer.iss` and click **Compile**.

## Move your current data from Supabase

This copies **medicines, stock, patients, visits, sales, credit, settings and staff accounts** (everyone keeps their username and password). It only **reads** the cloud database; nothing there is changed or deleted.

1. In Supabase, open your project → **Connect** → **Session pooler** and copy the connection string. It looks like
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with your database password (Project Settings → Database, where you can also reset it).
2. To also copy investigation files (blood reports, scans) and drug photos, get:
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - a **secret** key: Project Settings → API Keys → `sb_secret_…` (or the legacy `service_role` key)
3. Open `ZwePharmacy.exe` on the new computer → **Move data from the cloud** → paste them → **Copy data to this computer**. It takes from a few seconds to a few minutes.
4. Sign in with your usual username and password and check stock, patients and recent sales.
5. Keep the cloud version running for a few days while you check, then stop using it. Stock in v1 data becomes one “OPENING” batch per medicine with its existing expiry date.

The import only runs on a fresh installation (before any account exists), so it can never mix two shops' data.

## Moving to another computer later

On the old computer: **Settings → Data & backups → Back up now**, then **Download** (or copy the newest file from the backups folder) to a USB drive.
On the new computer: open `ZwePharmacy.exe`, finish the first-run screen with any temporary account, then **Settings → Data & backups → Restore from file…**, choose the backup, and close and reopen the app. The backup replaces everything, including the temporary account.

## Where things are

| Path in `%LOCALAPPDATA%\ZwePharmacy` | What |
|---|---|
| `zwe_pharmacy.db` | the database |
| `uploads\` | drug photos and investigation files |
| `backups\` | automatic and manual backups (`zwe-backup-YYYYMMDD-HHMMSS.zip`, last 30 kept) |
| `secrets.json` | sign-in signing keys for this computer |
| `zwe_pharmacy.log` | log file, useful when something goes wrong |

A backup `.zip` contains the database and all uploaded files. Keep one copy away from the shop computer (Settings → “Also copy backups to”), so a broken, stolen or flooded PC never means lost records.

## Build from source

Needs Python 3.10+ and Node.js 18+. From the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

The result is `desktop\dist\ZwePharmacy.exe` (one file, about 27 MB).

To run without building: build the frontend (`cd frontend; npm run build`), then
`python desktop\launcher.py` (add `--data-dir=C:\some\test\folder` to use a separate test database).

## Limits

- One computer at a time. The app listens only on this computer (127.0.0.1), so other PCs cannot connect. A second till over the shop Wi-Fi would be a future addition.
- No phone access from outside the shop; the cloud version is still available for that.
- The exe is not code-signed, so Windows shows a SmartScreen warning the first time.
