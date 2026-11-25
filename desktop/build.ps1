# Builds desktop\dist\ZwePharmacy.exe (one file, about 30 MB).
# Needs Python 3.10+ and Node.js 18+. Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "1/3 Building the React app..."
Push-Location frontend
npm install --no-audit --no-fund
npm run build
Pop-Location

Write-Host "2/3 Installing Python packages..."
if (-not (Test-Path desktop\.venv)) { python -m venv desktop\.venv }
desktop\.venv\Scripts\python -m pip install -q -r backend\requirements.txt -r desktop\requirements-desktop.txt

Write-Host "3/3 Packaging..."
desktop\.venv\Scripts\pyinstaller --noconfirm --clean --distpath desktop\dist --workpath desktop\build desktop\zwe_pharmacy.spec

Write-Host "Done: desktop\dist\ZwePharmacy.exe"
Write-Host "Optional installer: open desktop\installer.iss in Inno Setup (https://jrsoftware.org/isinfo.php) and click Compile."
