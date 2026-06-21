"""FastAPI app entrypoint.

Wires routers, CORS, the contract error model, and seeds the DB on first
startup if it's empty.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import SessionLocal, init_db
from .errors import (
    APIError,
    api_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .routers import (
    activity,
    auth,
    clubs,
    holdings,
    members,
    stocks,
    summary,
    transactions,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # Auto-seed on first startup if DB is empty.
    from .models import Stock, Transaction, TxStatus, User
    from .seed import seed_all

    with SessionLocal() as db:
        if db.query(User).first() is None:
            seed_all(db)

        # Live mode (network available): one-time pull of the full 上市/上櫃 master
        # so symbol autocomplete covers every stock; then refresh held quotes so
        # real prices replace the seeded mock cache. All best-effort (NFR-5).
        if settings.QUOTE_PROVIDER != "mock":
            from sqlalchemy import select

            from .services.quotes_read import refresh_quotes
            from .services.stock_master import sync_into_db

            # Only when the master is still ~seed-sized (avoid syncing every boot).
            if db.query(Stock).count() < 100:
                try:
                    sync_into_db(db)
                    db.commit()
                except Exception:
                    db.rollback()

            held = list(
                db.scalars(
                    select(Transaction.stock_symbol)
                    .where(Transaction.status == TxStatus.ACTIVE)
                    .distinct()
                ).all()
            )
            try:
                refresh_quotes(db, held)
                db.commit()
            except Exception:
                db.rollback()
    yield


app = FastAPI(title="同甘共股 CoLedger", lifespan=lifespan)

# CORS — allow the Vite dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Contract error model (§6.5).
app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Routers.
app.include_router(auth.router)
app.include_router(clubs.router)
app.include_router(members.router)
app.include_router(transactions.router)
app.include_router(holdings.router)
app.include_router(summary.router)
app.include_router(activity.router)
app.include_router(stocks.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "quote_provider": settings.QUOTE_PROVIDER}


# ── 供應前端 build（單一伺服器同時出 UI + API，讓一條通道就能公開）──
# 僅在 frontend/dist 存在時啟用；dev（Vite）不受影響。前端走相對 /api，同源即可。
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # /api/* 未匹配到路由 → 回通用 404 JSON（不要餵 index.html、也不用 CLUB_NOT_FOUND）。
        if full_path.startswith("api"):
            raise APIError(404, "NOT_FOUND", "找不到此 API 路徑")
        # 真實檔案（favicon.svg、assets/*）直接給；防目錄穿越後其餘路徑回 index.html。
        candidate = (_DIST / full_path).resolve()
        if full_path and _DIST in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
