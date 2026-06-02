"""
Retriever V4 — pgvector (Supabase) + detecção de loja + BM25 fallback.

Fluxo:
  1. Detecta se a query menciona o nome de uma loja → filtra por store_id
  2. Embed a query via OpenAI text-embedding-3-small
  3. Chama search_chunks (função SQL pgvector c/ probes=10) → busca semântica
     - Se loja detectada: busca SÓ nos chunks daquela loja
     - Se não: busca em toda a marca/grupo
  4. Se embeddings indisponíveis ou sem resultados → BM25 Python fallback
"""
import math
import re
from collections import Counter
from typing import Dict, List, Optional

from app.services.embedder import cosine_similarity, embed_text

STOPWORDS = set("""
a o os as um uma uns umas de da do das dos e é em no na nos nas para por com sem
que qual quais como quando onde quem isso isto aquilo esse essa esses essas ao aos
à às ou se sua seu suas seus sobre referente dentro nossa nosso nossos nossas mais
menos muito muita muitos muitas loja unidade contrato documento arquivo
""".split())

SEMANTIC_THRESHOLD = 0.20
SEMANTIC_TOP_K     = 20     # busca mais e filtra — compensa limitações do ivfflat


# ── Detecção de loja na query ────────────────────────────────────────────────
def _detect_store(query: str, brand_id: Optional[str]) -> Optional[str]:
    """
    Verifica se a query menciona o nome de uma loja cadastrada.
    Retorna o store_id se encontrar, ou None.
    """
    from app.db.supabase_store import get_stores

    if not brand_id:
        # Admin sem marca: busca em todas as lojas
        stores = get_stores()
    else:
        stores = get_stores(brand_id=brand_id)

    if not stores:
        return None

    query_upper = query.upper()
    # Ordena por nome mais longo primeiro (evita match parcial: "BARRA" vs "BARRA MALL")
    stores_sorted = sorted(stores, key=lambda s: len(s.get("name", "")), reverse=True)

    for s in stores_sorted:
        name = (s.get("name") or "").strip().upper()
        if not name or len(name) < 3:
            continue
        if name in query_upper:
            return s["id"]

    return None


# ── Tokenizador ──────────────────────────────────────────────────────────────
def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


# ── BM25-style lexical scoring ───────────────────────────────────────────────
def bm25_score(query_tokens: List[str], chunk_text: str) -> float:
    chunk_tokens = tokenize(chunk_text)
    if not chunk_tokens:
        return 0.0
    q = Counter(query_tokens)
    c = Counter(chunk_tokens)
    common = set(q) & set(c)
    lexical = sum(q[t] * c[t] for t in common)
    density = lexical / math.sqrt(len(chunk_tokens) + 1)
    exact_bonus = 2.0 if " ".join(query_tokens[:3]) in chunk_text.lower() else 0.0
    return density + exact_bonus


# ── Retriever principal ──────────────────────────────────────────────────────
def retrieve(
    query: str,
    top_k: int = 5,
    user_role: Optional[str] = None,
    user_departments: Optional[List[str]] = None,
    brand_id: Optional[str] = None,
    store_id: Optional[str] = None,
) -> List[Dict]:
    """
    Recupera os chunks mais relevantes para a query.
    1. Detecta loja mencionada na query → filtra automaticamente
    2. Busca semântica (pgvector) filtrada por loja/marca
    3. Fallback BM25 se sem embeddings
    """
    from app.db.supabase_client import get_client
    from app.db.supabase_store import get_chunks_for_bm25

    sb = get_client()

    # ── 0. Detecta loja mencionada na query ──────────────────────────────────
    detected_store = _detect_store(query, brand_id) if not store_id else None
    effective_store = store_id or detected_store

    # ── 1. Busca semântica via pgvector ──────────────────────────────────────
    query_emb = embed_text(query)
    if query_emb is not None:
        # Tenta busca filtrada pela loja detectada
        for attempt_store in ([effective_store, None] if effective_store else [None]):
            try:
                params = {
                    "query_embedding": query_emb,
                    "match_threshold": SEMANTIC_THRESHOLD,
                    "match_count": SEMANTIC_TOP_K,
                    "p_user_role": user_role,
                    "p_brand_id": brand_id,
                }
                # Se tem loja, filtra por store_id direto no SQL
                if attempt_store:
                    params["p_store_id"] = attempt_store

                result = sb.rpc("search_chunks", params).execute()
                rows = result.data or []

                if rows:
                    return [
                        {
                            "document_id":   str(r["doc_id"]),
                            "document_name": r["document_name"],
                            "category":      r.get("category", "Outros"),
                            "text":          r["chunk_text"],
                            "chunk_index":   0,
                            "page_hint":     r.get("page_hint"),
                            "score":         round(float(r["similarity"]), 4),
                            "retrieval":     "semantic",
                        }
                        for r in rows[:top_k]
                    ]
            except Exception:
                pass

    # ── 2. Fallback BM25 Python ──────────────────────────────────────────────
    chunks = get_chunks_for_bm25(
        user_role=user_role,
        user_departments=user_departments,
        brand_id=brand_id,
        store_id=effective_store,
    )
    if not chunks:
        return []

    query_tokens = tokenize(query)
    scored = []
    for ch in chunks:
        s = bm25_score(query_tokens, ch.get("text", ""))
        if s > 0:
            scored.append({**ch, "score": round(s, 4), "retrieval": "bm25"})
    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:top_k]

    if not top:
        return []

    # Enriquece com nome e categoria do documento
    doc_ids = list({str(c["doc_id"]) for c in top})
    docs_res = (
        sb.table("documents")
        .select("id,name,category")
        .in_("id", doc_ids)
        .execute()
    )
    docs_map = {str(d["id"]): d for d in (docs_res.data or [])}

    return [
        {
            "document_id":   str(c["doc_id"]),
            "document_name": docs_map.get(str(c["doc_id"]), {}).get("name", "Desconhecido"),
            "category":      docs_map.get(str(c["doc_id"]), {}).get("category", "Outros"),
            "text":          c.get("text", ""),
            "chunk_index":   0,
            "page_hint":     c.get("page_hint"),
            "score":         c["score"],
            "retrieval":     "bm25",
        }
        for c in top
    ]
