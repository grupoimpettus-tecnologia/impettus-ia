"""
Autenticação JWT + hashing de senha sem dependências externas.
Usa hashlib.pbkdf2_hmac (stdlib) em vez de passlib/bcrypt para evitar
incompatibilidades entre passlib 1.7.x e bcrypt >= 4.0.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

bearer_scheme = HTTPBearer()

_ITERATIONS = 260_000   # NIST SP 800-132 recomendação para PBKDF2-HMAC-SHA256
_HASH       = "sha256"
_SALT_BYTES = 32


# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Retorna hash PBKDF2-HMAC-SHA256 no formato 'pbkdf2:sha256:<iter>$<salt>$<dk>'."""
    salt = secrets.token_hex(_SALT_BYTES)
    dk   = hashlib.pbkdf2_hmac(_HASH, password.encode(), salt.encode(), _ITERATIONS)
    return f"pbkdf2:{_HASH}:{_ITERATIONS}${salt}${dk.hex()}"


def verify_password(plain: str, hashed: str) -> bool:
    """Compara em tempo constante para evitar timing attacks."""
    try:
        method, rest    = hashed.split("$", 1)
        _, hash_name, iterations = method.split(":")
        salt, stored_dk = rest.split("$")
        dk = hashlib.pbkdf2_hmac(
            hash_name,
            plain.encode(),
            salt.encode(),
            int(iterations),
        )
        return hmac.compare_digest(dk.hex(), stored_dk)
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(
    sub: str,
    name: str,
    role: str,
    brand_id: str | None = None,
    store_id: str | None = None,
    departments: list | None = None,
) -> str:
    payload = {
        "sub":         sub,
        "name":        name,
        "role":        role,
        "brand_id":    brand_id,
        "store_id":    store_id,
        "departments": departments or [],
        "exp":         datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"]
        )
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Token inválido")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
