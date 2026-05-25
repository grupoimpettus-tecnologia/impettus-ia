import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BASE_DIR / "storage"
INDEX_DIR = STORAGE_DIR / "index"
UPLOADS_DIR = STORAGE_DIR / "uploads"

DOCS_FILE           = INDEX_DIR / "documents.json"
CHUNKS_FILE         = INDEX_DIR / "chunks.json"
USERS_FILE          = INDEX_DIR / "users.json"
ACTIVITY_FILE       = INDEX_DIR / "activity.json"
CONVERSATIONS_FILE  = INDEX_DIR / "conversations.json"
DEPARTMENTS_FILE    = INDEX_DIR / "departments.json"
FAQS_FILE           = INDEX_DIR / "faqs.json"
NOTIFICATIONS_FILE  = INDEX_DIR / "notifications.json"

INDEX_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Documents ─────────────────────────────────────────────────────────────────
def get_documents():      return read_json(DOCS_FILE, [])
def save_documents(d):    write_json(DOCS_FILE, d)

# ── Chunks ────────────────────────────────────────────────────────────────────
def get_chunks():         return read_json(CHUNKS_FILE, [])
def save_chunks(c):       write_json(CHUNKS_FILE, c)

# ── Users ─────────────────────────────────────────────────────────────────────
def get_users():          return read_json(USERS_FILE, [])
def save_users(u):        write_json(USERS_FILE, u)

# ── Activity log ──────────────────────────────────────────────────────────────
def get_activity():       return read_json(ACTIVITY_FILE, [])
def save_activity(a):     write_json(ACTIVITY_FILE, a)

# ── Conversations ─────────────────────────────────────────────────────────────
def get_conversations():  return read_json(CONVERSATIONS_FILE, [])
def save_conversations(c):write_json(CONVERSATIONS_FILE, c)

# ── Departments ───────────────────────────────────────────────────────────────
def get_departments():    return read_json(DEPARTMENTS_FILE, [])
def save_departments(d):  write_json(DEPARTMENTS_FILE, d)

# ── FAQs ──────────────────────────────────────────────────────────────────────
def get_faqs():                  return read_json(FAQS_FILE, [])
def save_faqs(f):                write_json(FAQS_FILE, f)

# ── Notifications ──────────────────────────────────────────────────────────────
def get_notifications():         return read_json(NOTIFICATIONS_FILE, [])
def save_notifications(n):       write_json(NOTIFICATIONS_FILE, n)
