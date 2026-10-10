#ifndef PayloadDir
  #define PayloadDir "out\payload"
#endif
[Setup]
AppId={{9F6DD1E0-755B-4B59-872D-7287C250B866}
AppName=SEKHEM Runtime
AppVersion=1.0.0
AppPublisher=SEKHEM
DefaultDirName={localappdata}\Programs\SEKHEM Runtime
DefaultGroupName=SEKHEM Runtime
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=out\installer
OutputBaseFilename=SEKHEM Runtime Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\SEKHEM Runtime.exe
CloseApplications=force
RestartApplications=no
WizardStyle=modern
DisableProgramGroupPage=yes
SignTool=sekhem
SignedUninstaller=yes

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "startup"; Description: "Start SEKHEM Runtime when I sign in to Windows"; Flags: checkedonce

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SEKHEM Runtime"; ValueData: """{app}\SEKHEM Runtime.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Icons]
Name: "{group}\SEKHEM Runtime"; Filename: "{app}\SEKHEM Runtime.exe"
Name: "{group}\Uninstall SEKHEM Runtime"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\SEKHEM Runtime.exe"; Description: "Open SEKHEM Runtime"; Flags: nowait postinstall skipifsilent

; The private identity is intentionally outside {app}. Uninstall removes startup,
; shortcuts and installed binaries, but never deletes identity or user workspaces.
