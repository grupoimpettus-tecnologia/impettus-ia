"""
Embeddings reais via OpenAI text-embedding-3-small.
Fallback gracioso: retorna None quando a chave não está configurada ou a API falha.
Cosine similarity em Python puro (sem numpy) para manter o ambiente leve.
"""
import math
from typing import List, Optional

from app.core.config import settings

EMBED_MODEL = "text-embedding-3-small"
MAX_CHARS   = 8_000   # ~2 k tokens — seguro para o modelo
PRECISION   = 6       # casas decimais ao armazenar (reduz JSON ~3×)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Similaridade de cosseno entre dois vetores (Python puro)."""
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if not mag_a or not mag_b:
        return 0.0
    return dot / (mag_a * mag_b)


def _client():
    from openai import OpenAI
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def embed_text(text: str) -> Optional[List[float]]:
    """Gera embedding para um único texto. Retorna None se indisponível."""
    if not settings.OPENAI_API_KEY:
        return None
    try:
        resp = _client().embeddings.create(
            model=EMBED_MODEL,
            input=text[:MAX_CHARS],
        )
        return [round(v, PRECISION) for v in resp.data[0].embedding]
    except Exception:
        return None


def embed_batch(texts: List[str]) -> List[Optional[List[float]]]:
    """
    Gera embeddings para uma lista de textos em uma única chamada à API.
    Retorna lista de None para cada item se a API falhar ou a chave estiver ausente.
    """
    if not settings.OPENAI_API_KEY or not texts:
        return [None] * len(texts)
    try:
        truncated = [t[:MAX_CHARS] for t in texts]
        resp = _client().embeddings.create(
            model=EMBED_MODEL,
            input=truncated,
        )
        ordered = sorted(resp.data, key=lambda e: e.index)
        return [[round(v, PRECISION) for v in e.embedding] for e in ordered]
    except Exception:
        return [None] * len(texts)
