import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

def _build_database_url():
    user = os.getenv("POSTGRES_USER", "hilo")
    password = os.getenv("POSTGRES_PASSWORD", "hilo.pass")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "hilo")

    return (
        f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"
    )


class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")

    DATABASE_URL = _build_database_url()

    REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

    RQ_QUEUE_NAME = os.getenv("RQ_QUEUE_NAME", "hilo")

    SESSION_LIFETIME_DAYS = int(os.getenv("SESSION_LIFETIME_DAYS", "1"))
    PERMANENT_SESSION_LIFETIME = timedelta(days=SESSION_LIFETIME_DAYS)

    SESSION_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax")

    DATA_DIR = os.getenv("DATA_DIR", "data")
    RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "90"))

    WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
    WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "es")
    CHUNK_DURATION = int(os.getenv("CHUNK_DURATION", "5"))

    _CPU_COUNT = max(1, os.cpu_count() or 1)

    TRANSCRIBE_PARALLEL_WORKERS = min(
        int(os.getenv("TRANSCRIBE_PARALLEL_WORKERS", "4")),
        _CPU_COUNT
    )
    STYLIZE_PARALLEL_WORKERS = min(
        int(os.getenv("STYLIZE_PARALLEL_WORKERS", "4")),
        _CPU_COUNT
    )
    TRANSCRIBE_CHUNK_TIMEOUT = int(os.getenv("TRANSCRIBE_CHUNK_TIMEOUT", "30"))
    STYLIZE_PHOTO_TIMEOUT = int(os.getenv("STYLIZE_PHOTO_TIMEOUT", "60"))

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
    IMAGE_STYLE_ENABLED = (
        os.getenv("IMAGE_STYLE_ENABLED", "false").lower() == "true"
    )
    MAX_IMAGE_SIZE = int(os.getenv("MAX_IMAGE_SIZE", str(2 * 1024 * 1024)))
    MAX_CHUNK_SIZE = int(os.getenv("MAX_CHUNK_SIZE", str(5 * 1024 * 1024)))
