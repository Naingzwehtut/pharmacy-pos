; Optional Windows installer (Start menu + desktop shortcut, uninstaller).
; Build desktop\dist\ZwePOS.exe first, then compile this file with Inno Setup 6.
#define AppName "Zwe POS"
#define AppVersion "1.1.0"

[Setup]
AppId={{9B2E7C41-3D6A-4F0B-8C25-1E4A7D9F3B62}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Zwe POS
DefaultDirName={autopf}\ZwePOS
DefaultGroupName={#AppName}
OutputDir=dist
OutputBaseFilename=ZwePOS-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\ZwePOS.exe
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: checkedonce

[Files]
Source: "dist\ZwePOS.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\ZwePOS.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ZwePOS.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ZwePOS.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent

; Data in %LOCALAPPDATA%\ZwePOS is NOT removed on uninstall, so records are never lost by accident.
