import shutil
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.auth import create_token, get_current_user, hash_password, verify_password
from app.core.config import settings
from app.db.json_store import UPLOADS_DIR  # Mantém uploads no disco local
from app.db.supabase_client import get_client as get_sb
import app.db.supabase_store as db
from app.services.chunker import chunk_text
from app.services.embedder import embed_batch
from app.services.extractor import extract_text
from app.services.llm import answer_question
from app.services.retriever import retrieve

router = APIRouter()

CATEGORIES = ["Contratos","Financeiro","Fornecedores","Operacional","RH","Marketing","TI","Franqueados","Treinamentos","Outros"]
ROLES = [
    "Admin", "Presidência", "Diretoria", "BI", "P&D", "Marketing",
    "Expansão", "GGC", "Supply", "Operações", "Treinamento", "Comercial",
    "Delivery", "Projetos", "Tecnologia", "Financeiro", "TI",
    "Operação", "Franqueado",
]


# ── Pydantic models ───────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class ChatMessage(BaseModel):
    role: str       # "user" ou "assistant"
    content: str

class ChatRequest(BaseModel):
    question: str
    top_k: int = 5
    history: List[ChatMessage] = []   # últimas mensagens para contexto

class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Operações"
    departments: List[str] = []
    brand_id: Optional[str] = None
    store_id: Optional[str] = None

class DepartmentRequest(BaseModel):
    name: str
    description: str = ""

class FaqRequest(BaseModel):
    question: str
    answer: str
    category: str = "Geral"

class PermissionsRequest(BaseModel):
    allowed_roles: List[str] = []

class UpdateDocStoreRequest(BaseModel):
    store_id: Optional[str] = None

class CreateStoreRequest(BaseModel):
    name: str
    brand_id: str

class EnsureStoreRequest(BaseModel):
    name: str
    brand_id: str

class BulkStoresRequest(BaseModel):
    stores: List[CreateStoreRequest]


# ── Helpers ───────────────────────────────────────────────────────────────────
def _log(
    message: str,
    type: str = "info",
    user: str = "Sistema",
    user_email: str = "",
    brand_id: Optional[str] = None,
):
    db.log_activity({
        "id":         str(uuid.uuid4()),
        "type":       type,
        "message":    message,
        "username":   user,
        "user_email": user_email,
        "brand_id":   brand_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    })


def _ensure_admin():
    """Cria o usuário admin padrão no Supabase se não existir."""
    if not db.user_exists(settings.ADMIN_EMAIL):
        db.create_user({
            "id":              str(uuid.uuid4()),
            "name":            "Administrador",
            "email":           settings.ADMIN_EMAIL,
            "hashed_password": hash_password(settings.ADMIN_PASSWORD),
            "salt":            "",
            "role":            "Admin",
            "brand_id":        None,
            "store_id":        None,
            "created_at":      datetime.utcnow().isoformat() + "Z",
        })


# Executa na inicialização do módulo
try:
    _ensure_admin()
except Exception:
    pass  # Não bloqueia startup se Supabase não estiver disponível


# ── Health ────────────────────────────────────────────────────────────────────
@router.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": "3.0.0"}


# ── Auth ──────────────────────────────────────────────────────────────────────
@router.post("/auth/login")
def login(payload: LoginRequest):
    try:
        _ensure_admin()
    except Exception:
        pass

    # Suporte a login "admin" como alias
    email = settings.ADMIN_EMAIL if payload.email == "admin" else payload.email
    user  = db.get_user_by_email(email)

    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    departments = user.get("departments") or []
    token = create_token(
        sub=user["email"],
        name=user["name"],
        role=user["role"],
        brand_id=user.get("brand_id"),
        store_id=user.get("store_id"),
        departments=departments,
    )
    _log(
        f"Login: {user['name']}",
        "auth",
        user["name"],
        user["email"],
        brand_id=user.get("brand_id"),
    )
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "email":       user["email"],
            "name":        user["name"],
            "role":        user["role"],
            "departments": departments,
            "brand_id":    user.get("brand_id"),
            "store_id":    user.get("store_id"),
        },
    }


@router.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ── Stats ─────────────────────────────────────────────────────────────────────
@router.get("/stats")
def stats(current_user: dict = Depends(get_current_user)):
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    s = db.get_stats(brand_id=brand_id)
    return {
        **s,
        "openai_enabled": bool(settings.OPENAI_API_KEY),
        "version":        "V3.0",
    }


# ── Categories ────────────────────────────────────────────────────────────────
@router.get("/categories")
def list_categories(current_user: dict = Depends(get_current_user)):
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    docs   = db.get_documents(brand_id=brand_id)
    counts = Counter(d.get("category", "Outros") for d in docs)
    return {"categories": [{"name": c, "documents": counts.get(c, 0)} for c in CATEGORIES]}


# ── Brands ────────────────────────────────────────────────────────────────────
@router.get("/brands")
def list_brands(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return {"brands": db.get_brands()}


@router.get("/brands/stats")
def brands_with_stats(current_user: dict = Depends(get_current_user)):
    """Retorna todas as marcas com contadores de docs, usuários, lojas e conversas."""
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return {"brands": db.get_brands_with_stats()}


@router.get("/brands/{brand_id}/stats")
def brand_stats(brand_id: str, current_user: dict = Depends(get_current_user)):
    """Stats de uma marca específica."""
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    brand = db.get_brand_by_id(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Marca não encontrada")
    return {"stats": db.get_stats(brand_id=brand_id), "brand": brand}


@router.post("/brands/{brand_id}/auto-link-stores")
def auto_link_stores(brand_id: str, current_user: dict = Depends(get_current_user)):
    """
    Vincula documentos sem store_id às lojas da marca
    comparando o nome da loja com o nome do arquivo (case-insensitive).
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    brand = db.get_brand_by_id(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Marca não encontrada")
    result = db.auto_link_stores_by_name(brand_id)
    _log(
        f'Auto-link lojas: {result["linked"]}/{result["total_unlinked"]} docs vinculados',
        "document",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=brand_id,
    )
    return result


# ── Documents ─────────────────────────────────────────────────────────────────
@router.get("/documents")
def list_documents(current_user: dict = Depends(get_current_user)):
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    return {"documents": db.get_documents(brand_id=brand_id)}


@router.post("/documents/upload")
def upload_document(
    file: UploadFile = File(...),
    category: str = Form("Outros"),
    allowed_roles: str = Form(""),
    brand_id: Optional[str] = Form(None),   # Admin pode forçar brand_id via form
    store_id: Optional[str] = Form(None),   # Admin pode forçar store_id via form
    current_user: dict = Depends(get_current_user),
):
    allowed_ext = {".pdf", ".docx", ".xlsx", ".xls", ".xlsm", ".csv", ".txt", ".md"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Formato não suportado: {suffix}")
    if category not in CATEGORIES:
        category = "Outros"

    roles_list: List[str] = [
        r.strip() for r in allowed_roles.split(",")
        if r.strip() and r.strip() in ROLES
    ] if allowed_roles else []

    doc_id    = str(uuid.uuid4())
    safe_name = Path(file.filename or f"documento{suffix}").name
    dest      = UPLOADS_DIR / f"{doc_id}_{safe_name}"

    with dest.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        text        = extract_text(dest)
        chunks_text = chunk_text(text, chunk_size=1500, overlap=220)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Falha ao processar: {exc}")

    # Embeddings em lote
    embeddings     = embed_batch(chunks_text)
    has_embeddings = any(e is not None for e in embeddings)

    # Admin pode sobrescrever brand_id/store_id via form; outros usam o do JWT
    brand_id = brand_id or current_user.get("brand_id")
    store_id = store_id or current_user.get("store_id")

    document = {
        "id":            doc_id,
        "name":          safe_name,
        "category":      category,
        "allowed_roles": roles_list,
        "size_kb":       dest.stat().st_size // 1024,
        "embedded":      has_embeddings,
        "brand_id":      brand_id,
        "store_id":      store_id,
        "uploaded_by":   current_user.get("name", "Usuário"),
        "created_at":    datetime.utcnow().isoformat() + "Z",
    }
    saved_doc = db.create_document(document)

    chunk_rows = []
    for index, (chunk, emb) in enumerate(zip(chunks_text, embeddings)):
        row: dict = {
            "id":            str(uuid.uuid4()),
            "doc_id":        doc_id,
            "text":          chunk,
            "allowed_roles": roles_list,
            "brand_id":      brand_id,
            "store_id":      store_id,
            "created_at":    datetime.utcnow().isoformat() + "Z",
        }
        if emb is not None:
            row["embedding"] = emb
        chunk_rows.append(row)
    db.create_chunks(chunk_rows)

    retrieval_mode = "semântico" if has_embeddings else "lexical (BM25)"
    _log(
        f'Documento "{safe_name}" adicionado — {len(chunks_text)} chunks, indexação {retrieval_mode}',
        "document",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=brand_id,
    )
    return {"message": "Documento processado com sucesso", "document": saved_doc}


@router.patch("/documents/{document_id}/permissions")
def update_permissions(
    document_id: str,
    payload: PermissionsRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    valid_roles = [r for r in payload.allowed_roles if r in ROLES]

    doc = db.get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    db.update_document_permissions(document_id, valid_roles)
    _log(
        f'Permissões de "{doc["name"]}" atualizadas — '
        f'{"público" if not valid_roles else ", ".join(valid_roles)}',
        "document",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=current_user.get("brand_id"),
    )
    return {"message": "Permissões atualizadas", "allowed_roles": valid_roles}


@router.patch("/documents/{document_id}/store")
def update_doc_store(
    document_id: str,
    payload: UpdateDocStoreRequest,
    current_user: dict = Depends(get_current_user),
):
    """Atualiza a loja associada a um documento."""
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    doc = db.get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    db.update_document_store(document_id, payload.store_id)
    _log(
        f'Loja de "{doc["name"]}" atualizada',
        "document",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=doc.get("brand_id"),
    )
    return {"message": "Loja atualizada"}


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    doc = db.get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    db.delete_chunks_by_doc(document_id)
    db.delete_document(document_id)

    # Remove arquivo físico se existir
    (UPLOADS_DIR / f"{document_id}_{doc.get('name', '')}").unlink(missing_ok=True)

    _log(
        f'Documento "{doc["name"]}" removido',
        "document",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=doc.get("brand_id"),
    )
    return {"message": "Documento removido"}


# ── Stores (Lojas) ────────────────────────────────────────────────────────────
@router.get("/stores")
def list_stores(
    brand_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    effective_brand = brand_id or (
        None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    )
    return {"stores": db.get_stores(brand_id=effective_brand)}


@router.post("/stores")
def create_store(
    payload: CreateStoreRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    store = db.create_store({
        "id":         str(uuid.uuid4()),
        "name":       payload.name,
        "slug":       payload.name.lower().replace(" ", "-"),
        "brand_id":   payload.brand_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    })
    _log(f'Loja "{payload.name}" criada', "store", current_user.get("name", "Sistema"),
         current_user.get("sub", ""), brand_id=payload.brand_id)
    return {"store": store}


@router.post("/stores/ensure")
def ensure_store(
    payload: EnsureStoreRequest,
    current_user: dict = Depends(get_current_user),
):
    """Retorna loja existente ou cria nova (idempotente — safe para import em lote)."""
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    store = db.ensure_store(name=payload.name, brand_id=payload.brand_id)
    return {"store": store}


@router.post("/stores/import-spreadsheet")
def import_stores_from_spreadsheet(
    file: UploadFile = File(...),
    brand_id: str = Form(...),
    preview_only: str = Form("true"),
    current_user: dict = Depends(get_current_user),
):
    """
    Importa lojas de uma planilha Excel ou CSV.
    Detecta automaticamente a coluna com nomes de lojas.
    Se preview_only='true', retorna a lista sem criar; se 'false', cria as lojas.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")

    import tempfile, os
    suffix = Path(file.filename or "data.xlsx").suffix.lower()
    if suffix not in (".xlsx", ".xls", ".csv", ".tsv"):
        raise HTTPException(status_code=400, detail="Formato não suportado. Use .xlsx, .csv ou .tsv")

    # Salva temporário
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()

        import pandas as pd
        if suffix == ".csv":
            df = pd.read_csv(tmp.name, dtype=str)
        elif suffix == ".tsv":
            df = pd.read_csv(tmp.name, sep="\t", dtype=str)
        else:
            # Tenta carregar a aba "Inventario" (Oráculo V1) ou a primeira aba
            try:
                df = pd.read_excel(tmp.name, sheet_name="Inventario", dtype=str)
            except Exception:
                df = pd.read_excel(tmp.name, sheet_name=0, dtype=str)

        # Auto-detecta a coluna de lojas por nome
        STORE_COL_CANDIDATES = [
            "loja_identificada", "loja", "store", "unidade", "filial",
            "nome_loja", "store_name", "loja_nome",
        ]
        store_col = None
        for col in df.columns:
            if col.strip().lower() in STORE_COL_CANDIDATES:
                store_col = col
                break
        if not store_col:
            # Fallback: primeira coluna que contém "loja" ou "store" no nome
            for col in df.columns:
                if any(k in col.lower() for k in ("loja", "store", "unidade", "filial")):
                    store_col = col
                    break
        if not store_col:
            cols_list = ", ".join(df.columns[:15].tolist())
            raise HTTPException(
                status_code=400,
                detail=f"Não encontrei coluna de lojas. Colunas disponíveis: {cols_list}"
            )

        # Extrai nomes únicos, limpa
        raw_names = df[store_col].dropna().astype(str).str.strip()
        unique_names = sorted(set(n for n in raw_names if n and n.lower() not in (
            "nan", "não identificado", "raiz espetto", "ppp_rede", ""
        )))

        # Verifica quais já existem
        existing = db.get_stores(brand_id=brand_id)
        existing_upper = {s["name"].upper() for s in existing}
        new_names = [n for n in unique_names if n.upper() not in existing_upper]
        already = [n for n in unique_names if n.upper() in existing_upper]

        if preview_only.lower() != "false":
            return {
                "preview": True,
                "column_detected": store_col,
                "total_in_file": len(unique_names),
                "new_stores": new_names,
                "already_exist": already,
            }

        # Cria as novas
        created = []
        for name in new_names:
            store = db.ensure_store(name=name, brand_id=brand_id)
            if store:
                created.append(store)

        _log(
            f'{len(created)} loja(s) importada(s) de planilha "{file.filename}"',
            "store", current_user.get("name", "Sistema"),
            current_user.get("sub", ""), brand_id=brand_id,
        )
        return {
            "preview": False,
            "created": len(created),
            "already_existed": len(already),
            "stores": created,
        }
    finally:
        os.unlink(tmp.name)


@router.delete("/stores/{store_id}")
def delete_store(
    store_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    store = db.get_store_by_id(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    db.delete_store(store_id)
    _log(f'Loja "{store["name"]}" removida', "store", current_user.get("name", "Sistema"),
         current_user.get("sub", ""), brand_id=store.get("brand_id"))
    return {"message": "Loja removida"}


# ── Chat ──────────────────────────────────────────────────────────────────────
@router.post("/chat")
def chat(payload: ChatRequest, current_user: dict = Depends(get_current_user)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Pergunta vazia")

    user_role        = current_user.get("role")
    user_departments = current_user.get("departments") or []
    brand_id         = current_user.get("brand_id")
    store_id         = current_user.get("store_id")
    user_name        = current_user.get("name", "Usuário")
    user_email       = current_user.get("sub", "")

    # Monta histórico recente (últimas 10 msgs) para contexto conversacional
    history = [{"role": m.role, "content": m.content} for m in (payload.history or [])[-10:]]

    sources = retrieve(
        question,
        top_k=payload.top_k,
        user_role=user_role,
        user_departments=user_departments,
        brand_id=brand_id,
        store_id=store_id,
    )
    answer  = answer_question(question, sources, history=history)

    public_sources = [
        {
            "document_name": s.get("document_name"),
            "document_id":   s.get("document_id"),
            "category":      s.get("category", "Outros"),
            "chunk_index":   s.get("chunk_index", 0),
            "score":         s.get("score"),
            "preview":       s.get("text", "")[:700],
        }
        for s in sources
    ]

    db.create_conversation({
        "id":         str(uuid.uuid4()),
        "question":   question,
        "answer":     answer,
        "sources":    public_sources,
        "user_email": user_email,
        "user_name":  user_name,
        "brand_id":   brand_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    })

    _log(
        f'Pergunta: "{question[:90]}{"…" if len(question) > 90 else ""}"',
        "chat",
        user_name,
        user_email,
        brand_id=brand_id,
    )

    # ── Notificação automática quando a IA não encontra resposta ──────────────
    if not sources:
        db.create_notification({
            "id":             str(uuid.uuid4()),
            "type":           "unanswered_question",
            "question":       question,
            "asked_by":       user_name,
            "asked_by_email": user_email,
            "read":           False,
            "brand_id":       brand_id,
            "created_at":     datetime.utcnow().isoformat() + "Z",
        })

    return {"answer": answer, "sources": public_sources}


# ── Notifications ─────────────────────────────────────────────────────────────
@router.get("/notifications")
def list_notifications(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    brand_id = current_user.get("brand_id")
    return {"notifications": db.get_notifications(brand_id=brand_id)}


@router.get("/notifications/count")
def notifications_count(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        return {"count": 0}
    brand_id = current_user.get("brand_id")
    return {"count": db.count_unread_notifications(brand_id=brand_id)}


@router.patch("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    db.mark_notification_read(notif_id)
    return {"message": "Marcado como lido"}


@router.post("/notifications/read-all")
def mark_all_read(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    db.mark_all_notifications_read(brand_id=current_user.get("brand_id"))
    return {"message": "Todas marcadas como lidas"}


@router.delete("/notifications/{notif_id}")
def delete_notification(notif_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    db.delete_notification(notif_id)
    return {"message": "Notificação removida"}


# ── Sources ───────────────────────────────────────────────────────────────────
@router.get("/sources")
def sources(current_user: dict = Depends(get_current_user)):
    """
    Retorna documentos indexados como 'fontes'.
    Usa a tabela documents (com embedded=True) em vez de scanear chunks,
    evitando timeouts no free tier do Supabase.
    """
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    docs     = db.get_documents(brand_id=brand_id)

    result = []
    for d in docs:
        result.append({
            "document_id":   d["id"],
            "document_name": d.get("name", "Desconhecido"),
            "category":      d.get("category", "Outros"),
            "chunks":        1 if d.get("embedded") else 0,  # presença simbólica
            "embedded":      d.get("embedded", False),
            "brand_id":      d.get("brand_id"),
            "store_id":      d.get("store_id"),
            "previews":      [],
        })
    return {"sources": result}


# ── Activity ──────────────────────────────────────────────────────────────────
@router.get("/activity")
def activity(current_user: dict = Depends(get_current_user)):
    is_admin   = current_user.get("role") == "Admin"
    user_email = None if is_admin else current_user.get("sub", "")
    brand_id   = None if is_admin else current_user.get("brand_id")
    return {"activity": db.get_activity(user_email=user_email, brand_id=brand_id, limit=20)}


# ── Conversations history ─────────────────────────────────────────────────────
@router.get("/conversations")
def conversation_history(current_user: dict = Depends(get_current_user)):
    is_admin   = current_user.get("role") == "Admin"
    user_email = None if is_admin else current_user.get("sub")
    brand_id   = None if is_admin else current_user.get("brand_id")
    return {"conversations": db.get_conversations(user_email=user_email, brand_id=brand_id, limit=50)}


# ── Users ─────────────────────────────────────────────────────────────────────
@router.get("/users")
def list_users(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    brand_id = current_user.get("brand_id")
    return {"users": db.get_users(brand_id=brand_id)}


@router.post("/users")
def create_user(payload: CreateUserRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    if db.user_exists(payload.email):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Perfil inválido")
    # Valida departamentos — ignora silenciosamente os inválidos
    valid_depts = [d for d in payload.departments if d in ROLES]

    user = {
        "id":              str(uuid.uuid4()),
        "name":            payload.name,
        "email":           payload.email,
        "hashed_password": hash_password(payload.password),
        "salt":            "",
        "role":            payload.role,
        "departments":     valid_depts,
        "brand_id":        payload.brand_id,
        "store_id":        payload.store_id,
        "created_at":      datetime.utcnow().isoformat() + "Z",
    }
    saved = db.create_user(user)
    _log(
        f'Usuário "{payload.name}" criado',
        "user",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=current_user.get("brand_id"),
    )
    return {"message": "Usuário criado", "user": saved}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    users  = db.get_users()
    target = next((u for u in users if u["id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if target["email"] == settings.ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="Não é possível remover o admin principal")
    db.delete_user(user_id)
    _log(
        f'Usuário "{target["name"]}" removido',
        "user",
        current_user.get("name", "Sistema"),
        current_user.get("sub", ""),
        brand_id=current_user.get("brand_id"),
    )
    return {"message": "Usuário removido"}


# ── Departments ───────────────────────────────────────────────────────────────
@router.get("/departments")
def list_departments(current_user: dict = Depends(get_current_user)):
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    return {"departments": db.get_departments(brand_id=brand_id)}


@router.post("/departments")
def create_department(payload: DepartmentRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    dept = {
        "id":          str(uuid.uuid4()),
        "name":        payload.name,
        "description": payload.description,
        "brand_id":    current_user.get("brand_id"),
        "created_at":  datetime.utcnow().isoformat() + "Z",
    }
    return {"message": "Departamento criado", "department": db.create_department(dept)}


@router.delete("/departments/{dept_id}")
def delete_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    if not db.department_exists(dept_id):
        raise HTTPException(status_code=404, detail="Departamento não encontrado")
    db.delete_department(dept_id)
    return {"message": "Departamento removido"}


# ── FAQ ───────────────────────────────────────────────────────────────────────
@router.get("/faq")
def list_faq(current_user: dict = Depends(get_current_user)):
    brand_id = None if current_user.get("role") == "Admin" else current_user.get("brand_id")
    return {"faqs": db.get_faqs(brand_id=brand_id)}


@router.post("/faq")
def create_faq(payload: FaqRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    faq = {
        "id":         str(uuid.uuid4()),
        "question":   payload.question,
        "answer":     payload.answer,
        "category":   payload.category,
        "brand_id":   current_user.get("brand_id"),
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    return {"message": "FAQ criado", "faq": db.create_faq(faq)}


@router.delete("/faq/{faq_id}")
def delete_faq(faq_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    if not db.faq_exists(faq_id):
        raise HTTPException(status_code=404, detail="FAQ não encontrado")
    db.delete_faq(faq_id)
    return {"message": "FAQ removido"}
