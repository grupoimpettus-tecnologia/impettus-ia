; ============================================================================
; Impettus IA — Instalador Windows (Inno Setup 6)
; Uso interno — chaves já configuradas, zero configuração do usuário
; ============================================================================

#define AppName "Impettus IA"
#define AppVersion "12.0"
#define AppPublisher "Grupo Impettus"
#define AppURL "https://impettus.com.br"
#define AppExeName "ImpettusIA.exe"

; Caminhos relativos ao .iss
#define ProjectRoot ".."
#define BackendDir ProjectRoot + "\backend"
#define FrontendDist ProjectRoot + "\frontend\dist"
#define LauncherDir "."

[Setup]
AppId={{A7E8F3C2-1D4B-4F6A-9E2C-8B5D7A3F1E9C}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName=C:\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=ImpettusIA_Setup_v{#AppVersion}
SetupIconFile={#LauncherDir}\impettus.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#AppExeName}

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na &Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Files]
; Backend (app + config + venv)
Source: "{#BackendDir}\app\*"; DestDir: "{app}\backend\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BackendDir}\.env"; DestDir: "{app}\backend"; Flags: ignoreversion
Source: "{#BackendDir}\.venv\*"; DestDir: "{app}\backend\.venv"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pyc,__pycache__"

; Frontend buildado
Source: "{#FrontendDist}\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launcher + updater + ícone
Source: "{#LauncherDir}\launcher.pyw"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#LauncherDir}\updater.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#LauncherDir}\impettus.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\backend\.venv\Scripts\pythonw.exe"; Parameters: """{app}\launcher.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\impettus.ico"; Comment: "Abrir Impettus IA"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\backend\.venv\Scripts\pythonw.exe"; Parameters: """{app}\launcher.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\impettus.ico"; Comment: "Abrir Impettus IA"; Tasks: desktopicon

[Run]
; Abre o app após a instalação
Filename: "{app}\backend\.venv\Scripts\pythonw.exe"; Parameters: """{app}\launcher.pyw"""; WorkingDir: "{app}"; Description: "Abrir Impettus IA agora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Para o server antes de desinstalar
Filename: "taskkill"; Parameters: "/F /IM pythonw.exe /FI ""WINDOWTITLE eq Impettus*"""; Flags: runhidden

[Code]
// Para qualquer instância rodando antes de instalar/atualizar
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    // Mata todos os processos Python que possam estar rodando o Impettus IA
    Exec('taskkill', '/F /IM pythonw.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill', '/F /IM python.exe /FI "WINDOWTITLE eq *uvicorn*"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
  end;
end;
