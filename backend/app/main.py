from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import settings

# Frontend buildado — servido pelo FastAPI em produção
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

app = FastAPI(title=settings.APP_NAME, version="3.0.0")

# Em desenvolvimento aceita qualquer localhost/127.0.0.1 (qualquer porta)
# Em produção use BACKEND_CORS_ORIGINS no .env com as origens exatas
_env_origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

if settings.ENVIRONMENT == "local":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_env_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Reseta o cliente Supabase após erros de conexão para evitar cascata."""
    err = str(exc)
    if "disconnected" in err.lower() or "timeout" in err.lower() or "remoteprot" in err.lower():
        try:
            from app.db.supabase_client import reset_client
            reset_client()
        except Exception:
            pass
    return JSONResponse(status_code=500, content={"detail": "Erro interno — tente novamente"})


# ── Frontend estático (produção) ─────────────────────────────────────────────
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve o SPA React — qualquer rota não-API retorna index.html."""
        file = FRONTEND_DIST / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def root():
        return {"name": settings.APP_NAME, "status": "online", "version": "3.0.0"}
