"""
Impettus IA — Launcher (janela nativa, sem terminal)
─────────────────────────────────────────────────────
Executado via pythonw.exe (sem console).
1. Busca porta livre automaticamente (8000-8019)
2. Inicia o uvicorn em background (oculto)
3. Abre janela nativa (pywebview — parece programa, não browser)
4. Ícone na bandeja do sistema
5. Ao fechar a janela, mata o server limpo
"""
import os
import sys
import time
import socket
import subprocess
import threading

# ── Paths ────────────────────────────────────────────────────────────────────
APP_DIR  = os.path.dirname(os.path.abspath(__file__))
BACKEND  = os.path.join(APP_DIR, "backend")
PYTHON   = os.path.join(BACKEND, ".venv", "Scripts", "pythonw.exe")
if not os.path.exists(PYTHON):
    PYTHON = os.path.join(BACKEND, ".venv", "Scripts", "python.exe")
ICON_PATH = os.path.join(APP_DIR, "impettus.ico")

HOST = "127.0.0.1"
PORT_RANGE = range(8000, 8020)

server_proc = None
active_port = None
active_url  = None


def is_port_in_use(port, host="127.0.0.1"):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        s.connect((host, port))
        s.close()
        return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        return False


def is_port_bindable(port, host="127.0.0.1"):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind((host, port))
        s.close()
        return True
    except OSError:
        return False


def find_free_port():
    for port in PORT_RANGE:
        if is_port_bindable(port, HOST):
            return port
    return None


def check_already_running():
    import urllib.request
    for port in PORT_RANGE:
        if is_port_in_use(port, HOST):
            try:
                url = f"http://{HOST}:{port}/api/health"
                resp = urllib.request.urlopen(url, timeout=2)
                data = resp.read().decode()
                if "Impettus" in data:
                    return port
            except Exception:
                pass
    return None


def start_server(port):
    global server_proc, active_port, active_url
    active_port = port
    active_url  = f"http://{HOST}:{port}"

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"

    CREATE_NO_WINDOW = 0x08000000
    server_proc = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "app.main:app", "--host", HOST, "--port", str(port)],
        cwd=BACKEND,
        env=env,
        creationflags=CREATE_NO_WINDOW,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_server(timeout=30):
    for _ in range(timeout * 4):
        if server_proc and server_proc.poll() is not None:
            return False
        if is_port_in_use(active_port, HOST):
            return True
        time.sleep(0.25)
    return False


def stop_server():
    global server_proc
    if server_proc and server_proc.poll() is None:
        pid = server_proc.pid
        try:
            # Mata toda a árvore de processos (uvicorn + workers)
            CREATE_NO_WINDOW = 0x08000000
            subprocess.call(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                creationflags=CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            try:
                server_proc.kill()
            except Exception:
                pass
        time.sleep(0.5)


def show_error(msg):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "Impettus IA — Erro", 0x10)
    except Exception:
        pass


def open_native_window(url):
    """Abre o app como janela nativa (sem barra de endereço, parece programa)."""
    import webview

    icon = ICON_PATH if os.path.exists(ICON_PATH) else None

    # Seta AppUserModelID ANTES de criar a janela — faz o Windows usar o ícone certo na taskbar
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Impettus.IA.Desktop")
    except Exception:
        pass

    window = webview.create_window(
        title="Impettus IA",
        url=url,
        width=1400,
        height=850,
        min_size=(900, 600),
        resizable=True,
        confirm_close=False,
        text_select=True,
    )

    # Seta o ícone na janela + taskbar via Windows API
    def set_icon():
        if not icon:
            return
        try:
            import ctypes
            user32 = ctypes.windll.user32
            WM_SETICON = 0x0080
            # Carrega ícone grande (taskbar) e pequeno (título)
            hicon_big = user32.LoadImageW(None, icon, 1, 48, 48, 0x00000010)
            hicon_small = user32.LoadImageW(None, icon, 1, 16, 16, 0x00000010)
            for _ in range(20):  # tenta por até 5 segundos
                time.sleep(0.25)
                hwnd = user32.FindWindowW(None, "Impettus IA")
                if hwnd:
                    if hicon_big:
                        user32.SendMessageW(hwnd, WM_SETICON, 1, hicon_big)
                    if hicon_small:
                        user32.SendMessageW(hwnd, WM_SETICON, 0, hicon_small)
                    break
        except Exception:
            pass

    threading.Thread(target=set_icon, daemon=True).start()

    # Quando a janela fechar, para o server
    def on_closed():
        stop_server()

    window.events.closed += on_closed

    # Inicia a janela (bloqueia até fechar)
    webview.start(
        gui="edgechromium",   # usa Edge WebView2 (nativo do Windows 10/11)
        debug=False,
    )


def main():
    we_started_server = False

    # 0. Auto-update — verifica se há nova versão no GitHub
    try:
        from updater import check_and_update
        updated = check_and_update(APP_DIR)
        if updated:
            pass  # continua normalmente — já atualizou os arquivos
    except Exception:
        pass  # sem internet ou erro — segue com a versão atual

    # 1. Verifica se já está rodando
    existing = check_already_running()
    if existing:
        active_url_found = f"http://{HOST}:{existing}"
        open_native_window(active_url_found)
        sys.exit(0)

    # 2. Encontra porta livre
    port = find_free_port()
    if not port:
        show_error("Nenhuma porta disponível (8000-8019).\nFeche outros programas e tente novamente.")
        sys.exit(1)

    # 3. Inicia servidor
    start_server(port)
    we_started_server = True

    if wait_server():
        # 4. Abre janela nativa
        open_native_window(active_url)
    else:
        stop_server()
        show_error(f"Não foi possível iniciar o servidor na porta {port}.\nVerifique se a porta está livre.")
        sys.exit(1)


if __name__ == "__main__":
    main()
