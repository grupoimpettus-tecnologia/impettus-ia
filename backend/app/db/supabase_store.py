"""
Camada de acesso ao Supabase — substitui json_store.py.
Todas as funções usam operações granulares (insert/update/delete/select)
em vez do padrão "get all → modify → save all" do file store.
"""
from typing import Any, Dict, List, Optional

from app.db.supabase_client import get_client


# ── Helpers ───────────────────────────────────────────────────────────────────
def _data(res) -> List[Dict]:
    """Retorna lista de dados da resposta Supabase (vazia se falhar)."""
    return res.data or []


def _first(res) -> Optional[Dict]:
    """Retorna primeiro item da resposta Supabase (None se vazio)."""
    d = res.data
    return d[0] if d else None


# ── Brands (Marcas) ───────────────────────────────────────────────────────────
def get_brands() -> List[Dict]:
    return _data(get_client().table("brands").select("*").order("name").execute())


def get_brand_by_id(brand_id: str) -> Optional[Dict]:
    return _first(
        get_client().table("brands").select("*").eq("id", brand_id).execute()
    )


def get_brands_with_stats() -> List[Dict]:
    """Retorna todas as marcas com contadores de docs, usuários, lojas e conversas."""
    from collections import Counter

    sb     = get_client()
    brands = _data(sb.table("brands").select("*").order("name").execute())

    def _safe(table: str, col: str = "brand_id") -> List[Dict]:
        """Pagina em lotes de 1000 para superar o limite padrão do Supabase."""
        try:
            all_rows: List[Dict] = []
            page_size = 1000
            offset = 0
            while True:
                batch = _data(
                    sb.table(table).select(col).range(offset, offset + page_size - 1).execute()
                )
                all_rows.extend(batch)
                if len(batch) < page_size:
                    break
                offset += page_size
            return all_rows
        except Exception:
            return []

    doc_rows  = _safe("documents")
    usr_rows  = _safe("users")
    str_rows  = _safe("stores")
    conv_rows = _safe("conversations")
    # chunks removido — tabela grande, query lenta no free tier

    doc_count  = Counter(str(r["brand_id"]) for r in doc_rows  if r.get("brand_id"))
    usr_count  = Counter(str(r["brand_id"]) for r in usr_rows  if r.get("brand_id"))
    str_count  = Counter(str(r["brand_id"]) for r in str_rows  if r.get("brand_id"))
    conv_count = Counter(str(r["brand_id"]) for r in conv_rows if r.get("brand_id"))

    for b in brands:
        bid = str(b["id"])
        b["stats"] = {
            "documents":     doc_count.get(bid, 0),
            "users":         usr_count.get(bid, 0),
            "stores":        str_count.get(bid, 0),
            "conversations": conv_count.get(bid, 0),
            "chunks":        doc_count.get(bid, 0),  # aproximação — evita scan em chunks
        }
    return brands


# ── Stores (Lojas) ────────────────────────────────────────────────────────────
def get_stores(brand_id: Optional[str] = None) -> List[Dict]:
    q = get_client().table("stores").select("*").order("name")
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def get_store_by_id(store_id: str) -> Optional[Dict]:
    return _first(
        get_client().table("stores").select("*").eq("id", store_id).execute()
    )


def get_store_by_name(name: str, brand_id: str) -> Optional[Dict]:
    return _first(
        get_client()
        .table("stores")
        .select("*")
        .eq("name", name)
        .eq("brand_id", brand_id)
        .execute()
    )


def create_store(store: Dict) -> Dict:
    return _first(get_client().table("stores").insert(store).execute()) or store


def ensure_store(name: str, brand_id: str) -> Dict:
    """Retorna loja existente pelo nome+marca ou cria uma nova."""
    existing = get_store_by_name(name, brand_id)
    if existing:
        return existing
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return create_store({
        "id":         __import__("uuid").uuid4().__str__(),
        "name":       name,
        "slug":       slug,
        "brand_id":   brand_id,
        "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    })


def delete_store(store_id: str):
    get_client().table("stores").delete().eq("id", store_id).execute()


# ── Users ─────────────────────────────────────────────────────────────────────
def get_users(brand_id: Optional[str] = None) -> List[Dict]:
    q = get_client().table("users").select(
        "id,email,name,role,departments,brand_id,store_id,created_at"
    ).order("created_at")
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def get_user_by_email(email: str) -> Optional[Dict]:
    """Retorna o usuário com hashed_password (necessário para autenticação)."""
    return _first(
        get_client()
        .table("users")
        .select("id,email,name,role,departments,brand_id,store_id,hashed_password,created_at")
        .eq("email", email)
        .execute()
    )


def create_user(user: Dict) -> Dict:
    result = get_client().table("users").insert(user).execute()
    row = _first(result) or {}
    return {k: v for k, v in row.items() if k != "hashed_password"}


def delete_user(user_id: str):
    get_client().table("users").delete().eq("id", user_id).execute()


def user_exists(email: str) -> bool:
    r = (
        get_client()
        .table("users")
        .select("id", count="exact")
        .eq("email", email)
        .execute()
    )
    return (r.count or 0) > 0


# ── Documents ─────────────────────────────────────────────────────────────────
def get_documents(brand_id: Optional[str] = None) -> List[Dict]:
    """Retorna todos os documentos, paginando em lotes de 1000 para superar o limite padrão do Supabase."""
    sb = get_client()
    all_docs: List[Dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = sb.table("documents").select("*").order("created_at", desc=True)
        if brand_id:
            q = q.eq("brand_id", brand_id)
        batch = _data(q.range(offset, offset + page_size - 1).execute())
        all_docs.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_docs


def get_document_by_id(doc_id: str) -> Optional[Dict]:
    return _first(
        get_client().table("documents").select("*").eq("id", doc_id).execute()
    )


def create_document(doc: Dict) -> Dict:
    return _first(get_client().table("documents").insert(doc).execute()) or doc


def delete_document(doc_id: str):
    get_client().table("documents").delete().eq("id", doc_id).execute()


def update_document_permissions(doc_id: str, roles: List[str]):
    get_client().table("documents").update({"allowed_roles": roles}).eq(
        "id", doc_id
    ).execute()
    get_client().table("chunks").update({"allowed_roles": roles}).eq(
        "doc_id", doc_id
    ).execute()


def update_document_store(doc_id: str, store_id: Optional[str]):
    """Atualiza store_id de um documento e seus chunks."""
    get_client().table("documents").update({"store_id": store_id}).eq(
        "id", doc_id
    ).execute()
    get_client().table("chunks").update({"store_id": store_id}).eq(
        "doc_id", doc_id
    ).execute()


def auto_link_stores_by_name(brand_id: str) -> Dict[str, Any]:
    """
    Para cada documento sem store_id, verifica se o nome de alguma loja
    aparece no nome do arquivo (case-insensitive).
    Lojas com nome mais longo são testadas primeiro para evitar match parcial.
    Retorna contagem de documentos vinculados.
    """
    stores = get_stores(brand_id=brand_id)
    if not stores:
        return {"linked": 0, "skipped": 0, "total_unlinked": 0, "details": []}

    sb = get_client()
    # Pagina em lotes de 1000 para superar o limite padrão do Supabase
    all_docs: List[Dict] = []
    page_size = 1000
    offset = 0
    while True:
        batch = _data(
            sb.table("documents")
            .select("id,name,store_id")
            .eq("brand_id", brand_id)
            .order("created_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        all_docs.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    unlinked = [d for d in all_docs if not d.get("store_id")]

    # Lojas com nome mais longo primeiro — evita match parcial
    sorted_stores = sorted(stores, key=lambda s: len(s["name"]), reverse=True)

    linked  = 0
    details: List[Dict] = []

    for doc in unlinked:
        doc_name_upper = (doc.get("name") or "").upper()
        for store in sorted_stores:
            if store["name"].upper() in doc_name_upper:
                update_document_store(doc["id"], store["id"])
                linked += 1
                details.append({
                    "doc_name":   doc.get("name"),
                    "store_name": store["name"],
                })
                break

    return {
        "linked":          linked,
        "skipped":         len(unlinked) - linked,
        "total_unlinked":  len(unlinked),
        "details":         details[:100],  # Limita payload
    }


# ── Chunks ────────────────────────────────────────────────────────────────────
def create_chunks(chunks: List[Dict]):
    """Insere chunks em lote (máx 500 por chamada para evitar timeout)."""
    batch = 500
    for i in range(0, len(chunks), batch):
        get_client().table("chunks").insert(chunks[i : i + batch]).execute()


def delete_chunks_by_doc(doc_id: str):
    get_client().table("chunks").delete().eq("doc_id", doc_id).execute()


def get_chunks_for_bm25(
    user_role: Optional[str] = None,
    user_departments: Optional[List[str]] = None,
    brand_id: Optional[str] = None,
    store_id: Optional[str] = None,
) -> List[Dict]:
    """
    Retorna chunks para BM25.
    Cascata de visibilidade: loja → marca → grupo.
    Admin vê tudo; demais usuários vêem apenas docs públicos (allowed_roles=[])
    ou cujos allowed_roles intersectam com os departamentos do usuário.
    """
    q = (
        get_client()
        .table("chunks")
        .select("id,doc_id,text,page_hint,allowed_roles,brand_id,store_id")
        .limit(2000)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    chunks = _data(q.execute())

    # Cascata: usuário de loja vê chunks da sua loja + da marca + do grupo
    if store_id:
        chunks = [
            c for c in chunks
            if str(c.get("store_id") or "") == str(store_id)   # desta loja
            or c.get("store_id") is None                        # da marca / grupo
        ]

    # Admin vê tudo (dentro do filtro de cascata acima)
    if user_role == "Admin":
        return chunks

    # Constrói conjunto de acessos do usuário (role + departments)
    user_access: set = set(user_departments or [])
    if user_role:
        user_access.add(user_role)

    return [
        c
        for c in chunks
        if not c.get("allowed_roles")                               # público
        or bool(user_access & set(c.get("allowed_roles") or []))    # interseção
    ]


# ── Activity log ──────────────────────────────────────────────────────────────
def get_activity(
    user_email: Optional[str] = None,
    brand_id: Optional[str] = None,
    limit: int = 20,
) -> List[Dict]:
    q = (
        get_client()
        .table("activity")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if user_email:
        q = q.eq("user_email", user_email)
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def log_activity(entry: Dict):
    get_client().table("activity").insert(entry).execute()


# ── Conversations ─────────────────────────────────────────────────────────────
def get_conversations(
    user_email: Optional[str] = None,
    brand_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict]:
    q = (
        get_client()
        .table("conversations")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if user_email:
        q = q.eq("user_email", user_email)
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def create_conversation(conv: Dict):
    get_client().table("conversations").insert(conv).execute()


# ── Departments ───────────────────────────────────────────────────────────────
def get_departments(brand_id: Optional[str] = None) -> List[Dict]:
    q = get_client().table("departments").select("*").order("created_at", desc=True)
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def create_department(dept: Dict) -> Dict:
    return _first(get_client().table("departments").insert(dept).execute()) or dept


def delete_department(dept_id: str):
    get_client().table("departments").delete().eq("id", dept_id).execute()


def department_exists(dept_id: str) -> bool:
    r = (
        get_client()
        .table("departments")
        .select("id", count="exact")
        .eq("id", dept_id)
        .execute()
    )
    return (r.count or 0) > 0


# ── FAQs ──────────────────────────────────────────────────────────────────────
def get_faqs(brand_id: Optional[str] = None) -> List[Dict]:
    q = get_client().table("faqs").select("*").order("created_at", desc=True)
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def create_faq(faq: Dict) -> Dict:
    return _first(get_client().table("faqs").insert(faq).execute()) or faq


def delete_faq(faq_id: str):
    get_client().table("faqs").delete().eq("id", faq_id).execute()


def faq_exists(faq_id: str) -> bool:
    r = (
        get_client()
        .table("faqs")
        .select("id", count="exact")
        .eq("id", faq_id)
        .execute()
    )
    return (r.count or 0) > 0


# ── Notifications ─────────────────────────────────────────────────────────────
def get_notifications(brand_id: Optional[str] = None) -> List[Dict]:
    q = (
        get_client()
        .table("notifications")
        .select("*")
        .order("created_at", desc=True)
        .limit(100)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    return _data(q.execute())


def create_notification(notif: Dict):
    get_client().table("notifications").insert(notif).execute()


def count_unread_notifications(brand_id: Optional[str] = None) -> int:
    q = (
        get_client()
        .table("notifications")
        .select("id", count="exact")
        .eq("read", False)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    r = q.execute()
    return r.count or 0


def mark_notification_read(notif_id: str):
    get_client().table("notifications").update({"read": True}).eq(
        "id", notif_id
    ).execute()


def mark_all_notifications_read(brand_id: Optional[str] = None):
    q = get_client().table("notifications").update({"read": True}).eq("read", False)
    if brand_id:
        q = q.eq("brand_id", brand_id)
    q.execute()


def delete_notification(notif_id: str):
    get_client().table("notifications").delete().eq("id", notif_id).execute()


# ── Stats ─────────────────────────────────────────────────────────────────────
def get_stats(brand_id: Optional[str] = None) -> Dict[str, Any]:
    sb = get_client()

    def _count(table: str, filters: Dict = {}) -> int:
        """Conta registros com try/except — nunca deixa um timeout derrubar a rota."""
        try:
            q = sb.table(table).select("id", count="exact")
            for k, v in filters.items():
                q = q.eq(k, v)
            if brand_id:
                q = q.eq("brand_id", brand_id)
            return q.execute().count or 0
        except Exception:
            return 0

    # Categorias — baseado em documents (nunca chunks)
    try:
        docs_q = sb.table("documents").select("category")
        if brand_id:
            docs_q = docs_q.eq("brand_id", brand_id)
        docs_data = _data(docs_q.execute())
        cats = len(set(d.get("category", "Outros") for d in docs_data))
    except Exception:
        cats = 0

    # Embedded chunks — usa coluna boolean em documents (evita scan de vector)
    try:
        emb_q = sb.table("documents").select("id", count="exact").eq("embedded", True)
        if brand_id:
            emb_q = emb_q.eq("brand_id", brand_id)
        embedded_count = emb_q.execute().count or 0
    except Exception:
        embedded_count = 0

    n_docs   = _count("documents")
    n_convs  = _count("conversations")
    n_stores = _count("stores")
    n_users  = _count("users")

    return {
        "documents":       n_docs,
        "chunks":          n_docs,       # aproximação segura — evita timeout na tabela chunks
        "categories":      cats,
        "sources":         n_docs,
        "conversations":   n_convs,
        "embedded_chunks": embedded_count,
        "stores":          n_stores,
        "users":           n_users,
    }
