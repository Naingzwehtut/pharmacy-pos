; Optional Windows installer (Start menu + desktop shortcut, uninstaller).
; Build desktop\dist\ZwePharmacy.exe first, then compile this file with Inno Setup 6.
#define AppName "Zwe Pharmacy"
#define AppVersion "2.1.0"

[Setup]
AppId={{6F3C2B6E-5B1A-4C7E-9E43-2A7D3E5F9A11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Zwe Pharmacy
DefaultDirName={autopf}\ZwePharmacy
DefaultGroupName={#AppName}
OutputDir=dist
OutputBaseFilename=ZwePharmacy-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\ZwePharmacy.exe
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: checkedonce

[Files]
Source: "dist\ZwePharmacy.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\ZwePharmacy.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ZwePharmacy.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ZwePharmacy.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent

; Data in %LOCALAPPDATA%\ZwePharmacy is NOT removed on uninstall, so records are never lost by accident.
