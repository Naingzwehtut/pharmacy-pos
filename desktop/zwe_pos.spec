# PyInstaller build for the Zwe POS desktop app. Run desktop\build.ps1.
import os

from PyInstaller.utils.hooks import collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(ROOT, "desktop", "launcher.py")],
    pathex=[os.path.join(ROOT, "backend")],
    datas=[(os.path.join(ROOT, "frontend", "dist"), os.path.join("frontend", "dist"))],
    hiddenimports=collect_submodules("app") + [
        "config",
        "waitress",
        "psycopg2",
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.postgresql",
    ],
    excludes=["pytest", "PIL"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name="ZwePOS",
    icon=os.path.join(ROOT, "desktop", "icon.ico"),
    console=False,
    upx=False,
)
