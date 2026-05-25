"""
Cliente Supabase singleton.
Usa SUPABASE_SERVICE_KEY (service_role) para operações server-side que
precisam contornar as políticas RLS. Fallback para SUPABASE_ANON_KEY se
a service key não estiver configurada.
"""
from supabase import Client, create_client

from app.core.config import settings

_client: Client | None = None


def get_client() -> Client:
    """Retorna cliente Supabase, recriando se a conexão foi perdida."""
    global _client
    if _client is None:
        _client = _create()
    return _client


def reset_client():
    """Força recriação do cliente (útil após RemoteProtocolError / timeout)."""
    global _client
    _client = None


def _create() -> Client:
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_KEY
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios. "
            "Configure no arquivo backend/.env"
        )
    return create_client(url, key)
