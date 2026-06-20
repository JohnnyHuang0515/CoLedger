"""Application configuration via environment variables."""
from __future__ import annotations

import os

try:  # optional: load a local .env so settings persist without exporting envs
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv not installed — env vars still work
    pass


class Settings:
    """Lightweight settings holder (POC; no need for full pydantic-settings)."""

    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "poc-dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "720"))  # 12h

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite:///./app.db"
    )

    # Quote provider: "mock" (default, offline, deterministic) | "finmind"
    QUOTE_PROVIDER: str = os.getenv("QUOTE_PROVIDER", "mock").lower()
    FINMIND_TOKEN: str = os.getenv("FINMIND_TOKEN", "")

    # Stale threshold: if we haven't successfully fetched a quote within this
    # many minutes, mark it stale (NFR-5: source-down → degraded display).
    QUOTE_STALE_MINUTES: int = int(os.getenv("QUOTE_STALE_MINUTES", "20"))
    # How often the read path re-hits the live provider per symbol (throttle to
    # respect provider rate limits; NFR-4 ≈ every 15 min).
    QUOTE_REFRESH_MINUTES: int = int(os.getenv("QUOTE_REFRESH_MINUTES", "15"))

    # CORS
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",")


settings = Settings()
