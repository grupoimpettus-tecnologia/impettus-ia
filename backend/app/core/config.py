import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME:             str = os.getenv("APP_NAME",             "Impettus IA")
    ENVIRONMENT:          str = os.getenv("ENVIRONMENT",          "local")
    BACKEND_CORS_ORIGINS: str = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    OPENAI_API_KEY:       str = os.getenv("OPENAI_API_KEY",       "")
    OPENAI_MODEL:         str = os.getenv("OPENAI_MODEL",         "gpt-4.1-mini")
    ADMIN_EMAIL:          str = os.getenv("ADMIN_EMAIL",          "admin@impettus.local")
    ADMIN_PASSWORD:       str = os.getenv("ADMIN_PASSWORD",       "Admin@123")
    SECRET_KEY:           str = os.getenv("SECRET_KEY",           "impettus-secret-mude-em-producao-2024")
    JWT_EXPIRE_MINUTES:   int = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
    # Supabase — usa service key se definida, senão cai para anon key
    SUPABASE_URL:         str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = (
        os.getenv("SUPABASE_SERVICE_KEY") or
        os.getenv("SUPABASE_ANON_KEY", "")
    )


settings = Settings()
