"""
Retriever V3 — pgvector (Supabase) + BM25 Python fallback.

Fluxo:
  1. Embed a query via OpenAI text-embedding-3-small
  2. Chama match_chunks_with_doc (função SQL pgvector) → busca semântica
  3. Se embeddings indisponíveis ou sem resultados → BM25 em Python sobre
     os chunks buscados do Supabase (limitado a 2000 para datasets grandes)
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
menos muito muita muitos muitas
""".split())

SEMANTIC_THRESHOLD = 0.25


# ── Tokenizador ───────────────────────────────────────────────────────────────
def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


# ── BM25-style lexical scoring ────────────────────────────────────────────────
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


# ── Retriever principal ───────────────────────────────────────────────────────
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
    Cascata: loja → marca → grupo.
    Usa pgvector para busca semântica; BM25 Python como fallback.
    """
    from app.db.supabase_client import get_client
    from app.db.supabase_store import get_chunks_for_bm25

    sb = get_client()

    # ── 1. Busca semântica via pgvector ───────────────────────────────────────
    query_emb = embed_text(query)
    if query_emb is not None:
        try:
            result = sb.rpc(
                "match_chunks_with_doc",
                {
                    "query_embedding": query_emb,
                    "match_threshold": SEMANTIC_THRESHOLD,
                    "match_count": top_k,
                    "p_user_role": user_role,
                    "p_brand_id": brand_id,
                },
            ).execute()

            rows = result.data or []
            if rows:
                # Aplica cascata de loja em memória quando store_id fornecido
                if store_id:
                    rows = [
                        r for r in rows
                        if str(r.get("store_id") or "") == str(store_id)
                        or r.get("store_id") is None
                    ]
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
                    for r in rows
                ]
        except Exception:
            pass  # Cai para BM25 se pgvector falhar

    # ── 2. Fallback BM25 Python ───────────────────────────────────────────────
    chunks = get_chunks_for_bm25(
        user_role=user_role,
        user_departments=user_departments,
        brand_id=brand_id,
        store_id=store_id,
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

    # Enriquece com nome e categoria do documento via JOIN
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
