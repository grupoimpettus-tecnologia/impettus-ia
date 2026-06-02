"""
wait_migration.py  <num_shards>
───────────────────────────────
Watcher leve para a migração paralela. Reporta a contagem de docs a cada 30s e
sai (naturalmente, antes do teto de 10 min) com:
  MIGRATION_DONE   quando TODOS os shards escreveram seu sentinela .shard_done_*
  STILL_RUNNING    quando estourou a janela (relançar watcher)
"""
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = BACKEND_DIR / "scripts"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from app.db.supabase_client import get_client, reset_client

SHARDS   = int(sys.argv[1]) if len(sys.argv) > 1 else 5
WINDOW   = 9.5 * 60
INTERVAL = 30

deadline = time.time() + WINDOW


def shards_done() -> int:
    return sum((SCRIPTS_DIR / f".shard_done_{i}").exists() for i in range(SHARDS))


while time.time() < deadline:
    try:
        n = (get_client()
             .table("documents")
             .select("id", count="exact")
             .eq("uploaded_by", "Migração Oráculo")
             .limit(1)
             .execute()).count
    except Exception as e:
        reset_client()
        n = None
        print(f"query_err: {str(e)[:120]}", flush=True)

    done = shards_done()
    print(f"docs={n} shards_done={done}/{SHARDS}", flush=True)
    if done >= SHARDS:
        print("MIGRATION_DONE", flush=True)
        sys.exit(0)
    time.sleep(INTERVAL)

print(f"STILL_RUNNING shards_done={shards_done()}/{SHARDS}", flush=True)
sys.exit(0)
