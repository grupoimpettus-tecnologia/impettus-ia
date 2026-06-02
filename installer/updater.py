"""
Impettus IA — Auto-Updater
──────────────────────────
Verifica se há atualizações no GitHub e aplica automaticamente.

Fluxo:
  1. Lê o commit hash local (version.txt)
  2. Consulta a API do GitHub pelo último commit do master
  3. Se diferente → baixa o ZIP do repo, extrai os arquivos atualizados
  4. Grava o novo hash em version.txt
  5. Retorna True se atualizou (launcher deve reiniciar o server)
"""
import io
import json
import os
import shutil
import zipfile
from pathlib import Path
from urllib import request, error

GITHUB_OWNER = "grupoimpettus-tecnologia"
GITHUB_REPO  = "impettus-ia"
GITHUB_BRANCH = "master"
API_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/commits/{GITHUB_BRANCH}"
ZIP_URL = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/archive/refs/heads/{GITHUB_BRANCH}.zip"

TIMEOUT = 10  # segundos


def get_local_version(app_dir: str) -> str:
    """Lê o hash do commit local."""
    vf = os.path.join(app_dir, "version.txt")
    if os.path.exists(vf):
        return open(vf, "r").read().strip()
    return ""


def save_local_version(app_dir: str, sha: str):
    """Salva o hash do commit local."""
    vf = os.path.join(app_dir, "version.txt")
    with open(vf, "w") as f:
        f.write(sha)


def get_remote_version() -> str:
    """Consulta o último commit SHA do GitHub."""
    try:
        req = request.Request(API_URL, headers={"Accept": "application/vnd.github.v3+json"})
        resp = request.urlopen(req, timeout=TIMEOUT)
        data = json.loads(resp.read().decode())
        return data.get("sha", "")
    except Exception:
        return ""


def download_and_extract(app_dir: str) -> bool:
    """Baixa o ZIP do repo e sobrescreve backend/app, frontend/dist e installer/launcher."""
    try:
        resp = request.urlopen(ZIP_URL, timeout=60)
        zip_data = io.BytesIO(resp.read())
        zf = zipfile.ZipFile(zip_data)

        # O ZIP tem uma pasta raiz: "impettus-ia-master/"
        prefix = f"{GITHUB_REPO}-{GITHUB_BRANCH}/"

        # Arquivos que queremos atualizar
        update_dirs = [
            ("backend/app/", os.path.join(app_dir, "backend", "app")),
            ("frontend/dist/", os.path.join(app_dir, "frontend", "dist")),
        ]
        update_files = [
            ("installer/launcher.pyw", os.path.join(app_dir, "launcher.pyw")),
        ]

        for zip_dir, local_dir in update_dirs:
            full_prefix = prefix + zip_dir
            for info in zf.infolist():
                if info.filename.startswith(full_prefix) and not info.is_dir():
                    rel = info.filename[len(full_prefix):]
                    dest = os.path.join(local_dir, rel)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with zf.open(info) as src, open(dest, "wb") as dst:
                        dst.write(src.read())

        for zip_path, local_path in update_files:
            full_path = prefix + zip_path
            try:
                with zf.open(full_path) as src, open(local_path, "wb") as dst:
                    dst.write(src.read())
            except KeyError:
                pass  # arquivo não existe no repo, ignora

        zf.close()
        return True
    except Exception:
        return False


def check_and_update(app_dir: str) -> bool:
    """
    Verifica e aplica atualizações.
    Retorna True se atualizou (caller deve reiniciar o server).
    """
    local_sha = get_local_version(app_dir)
    remote_sha = get_remote_version()

    if not remote_sha:
        return False  # sem internet ou API falhou — continua normal

    if local_sha == remote_sha:
        return False  # já está atualizado

    # Tem atualização!
    success = download_and_extract(app_dir)
    if success:
        save_local_version(app_dir, remote_sha)
        return True

    return False
