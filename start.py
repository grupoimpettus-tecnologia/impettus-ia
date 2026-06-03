"""
start.py — Impettus IA V12
===========================
Script de inicialização unificado para Windows (PowerShell / cmd).
Não requer dependências além da stdlib Python 3.8+.

Uso:
    python start.py              # detecta portas, sobe backend+frontend, abre browser
    python start.py --no-browser # só sobe os processos, não abre browser
"""
import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

# ── Caminhos base ─────────────────────────────────────────────────────────────
ROOT     = Path(__file__).resolve().parent
BACKEND  = ROOT / "backend"
FRONTEND = ROOT / "frontend"
ENV_FILE = FRONTEND / ".env"

BACKEND_PORT_START  = 8000
FRONTEND_PORT_START = 5173


# ── Detecção de porta livre ───────────────────────────────────────────────────
def find_free_port(start: int, host: str = "127.0.0.1") -> int:
    """Retorna a primeira porta >= start que esteja livre para bind."""
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"Nenhuma porta livre encontrada a partir de {start}")


# ── Gravação do .env do Vite ──────────────────────────────────────────────────
def write_frontend_env(backend_port: int) -> None:
    """Reescreve frontend/.env com a URL correta do backend."""
    content = f"VITE_API_URL=http://localhost:{backend_port}/api\n"
    ENV_FILE.write_text(content, encoding="utf-8")
    print(f"[start.py]  frontend/.env  -> VITE_API_URL=http://localhost:{backend_port}/api")


# ── Inicialização dos processos ───────────────────────────────────────────────
def start_backend(port: int) -> subprocess.Popen:
    """Inicia uvicorn usando o Python do .venv se existir, senão o do PATH."""
    venv_python = BACKEND / ".venv" / "Scripts" / "python.exe"
    python = str(venv_python) if venv_python.exists() else sys.executable

    cmd = [python, "-m", "uvicorn", "app.main:app",
           "--host", "127.0.0.1", "--port", str(port), "--reload"]

    print(f"[start.py]  Backend   -> porta {port}  (PID pendente)")
    return subprocess.Popen(cmd, cwd=str(BACKEND))


def start_frontend(port: int) -> subprocess.Popen:
    """Inicia Vite dev server."""
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    cmd = [npm, "run", "dev", "--", "--port", str(port)]

    print(f"[start.py]  Frontend  -> porta {port}  (PID pendente)")
    return subprocess.Popen(cmd, cwd=str(FRONTEND))


# ── Aguarda o backend responder ───────────────────────────────────────────────
def wait_for_backend(port: int, timeout: int = 30) -> bool:
    """Testa conexão TCP a cada 0.5s até o servidor aceitar conexões."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.5)
    return False


# ── Encerramento limpo ────────────────────────────────────────────────────────
_procs: list = []

def shutdown(signum=None, frame=None):
    print("\n[start.py]  Encerrando processos...")
    for p in _procs:
        try:
            if sys.platform == "win32":
                # taskkill /F /T mata toda a árvore (uvicorn spawna workers)
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                p.terminate()
        except Exception:
            pass
    sys.exit(0)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Impettus IA V12 — inicializador unificado")
    parser.add_argument("--no-browser", action="store_true",
                        help="Não abre o browser automaticamente")
    args = parser.parse_args()

    print("\n========================================")
    print("       Impettus IA  -  V12.0")
    print("       Inicializador unificado")
    print("========================================\n")

    # 1. Detecta portas livres
    backend_port  = find_free_port(BACKEND_PORT_START)
    frontend_port = find_free_port(FRONTEND_PORT_START)
    print(f"[start.py]  Portas livres detectadas  -> backend:{backend_port}  frontend:{frontend_port}\n")

    # 2. Escreve .env do Vite com a porta correta do backend
    write_frontend_env(backend_port)
    print()

    # 3. Inicia os processos
    backend_proc  = start_backend(backend_port)
    frontend_proc = start_frontend(frontend_port)

    _procs.extend([backend_proc, frontend_proc])

    # 4. Registra handlers de sinal
    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 5. Aguarda backend ficar disponível antes de abrir o browser
    print("\n[start.py]  Aguardando backend inicializar...")
    if wait_for_backend(backend_port):
        print(f"[start.py]  Backend pronto  -> http://localhost:{backend_port}/api/health")
        if not args.no_browser:
            url = f"http://localhost:{frontend_port}"
            print(f"[start.py]  Abrindo browser  -> {url}")
            webbrowser.open(url)
    else:
        print("[start.py]  AVISO: backend não respondeu em 30s — verifique os logs acima.")

    print(f"\n[start.py]  Acesse: http://localhost:{frontend_port}")
    print("[start.py]  Pressione Ctrl+C para encerrar backend e frontend.\n")

    # 6. Monitora se algum processo morreu inesperadamente
    while True:
        time.sleep(2)
        for p in _procs:
            if p.poll() is not None:
                print(f"\n[start.py]  AVISO: processo PID {p.pid} encerrou (code {p.returncode}). Encerrando tudo.")
                shutdown()


if __name__ == "__main__":
    main()
