"""Read-side quote access: load cached quotes, throttled live refresh, stale flag.

The `quotes` table is the cache. `ensure_quotes_fresh()` refreshes it from the
configured provider, throttled per symbol (QUOTE_REFRESH_MINUTES) to respect
provider rate limits. `get_quote_view()` reads the cache and flags stale when we
haven't *successfully fetched* within QUOTE_STALE_MINUTES — i.e. the source is
down (NFR-5). `as_of` (the data's own timestamp) is still surfaced for display.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Quote
from .quote_provider import get_provider


@dataclass
class QuoteView:
    symbol: str
    price: Decimal | None
    as_of: datetime | None
    stale: bool


def _as_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _age_minutes(dt: datetime | None) -> float | None:
    dt = _as_aware(dt)
    if dt is None:
        return None
    return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0


def get_quote_view(db: Session, symbol: str) -> QuoteView:
    q = db.get(Quote, symbol)
    if q is None:
        return QuoteView(symbol=symbol, price=None, as_of=None, stale=True)
    fetch_age = _age_minutes(q.fetched_at)
    stale = fetch_age is None or fetch_age > settings.QUOTE_STALE_MINUTES
    return QuoteView(
        symbol=symbol,
        price=Decimal(q.price),
        as_of=_as_aware(q.as_of),
        stale=stale,
    )


def get_quote_views(db: Session, symbols: list[str]) -> dict[str, QuoteView]:
    return {s: get_quote_view(db, s) for s in symbols}


def ensure_quotes_fresh(db: Session, symbols: list[str]) -> None:
    """Refresh cache entries whose last fetch is older than the refresh window
    (or missing). Throttled so we don't hit the provider on every request.
    Best-effort: provider failures keep the existing (now-ageing) cache row,
    which the read path will eventually mark stale. Commits on change.
    """
    if not symbols:
        return
    due: list[str] = []
    for s in set(symbols):
        q = db.get(Quote, s)
        age = _age_minutes(q.fetched_at) if q else None
        if q is None or age is None or age > settings.QUOTE_REFRESH_MINUTES:
            due.append(s)
    if due:
        refresh_quotes(db, due)
        db.commit()


def refresh_quotes(db: Session, symbols: list[str]) -> None:
    """Best-effort refresh of the quote cache via the configured provider.

    Failures are swallowed per symbol (NFR-5); existing rows are kept.
    Caller commits.
    """
    provider = get_provider()
    fetched = provider.fetch_quotes(symbols)
    now = datetime.now(timezone.utc)
    for symbol, fq in fetched.items():
        existing = db.get(Quote, symbol)
        if existing is None:
            db.add(
                Quote(
                    stock_symbol=symbol,
                    price=fq.price,
                    as_of=fq.as_of,
                    fetched_at=now,
                )
            )
        else:
            existing.price = fq.price
            existing.as_of = fq.as_of
            existing.fetched_at = now
