"""Stock search + single-symbol quote (FR-6/FR-7)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import errors
from ..db import get_db
from ..deps import get_current_user
from ..models import Stock, User
from ..schemas import (
    QuoteResponse,
    StockListResponse,
    StockOut,
    money_str,
)
from ..services.quotes_read import ensure_quotes_fresh, get_quote_view

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


def _iso(dt):
    return dt.isoformat() if dt is not None else None


@router.get("", response_model=StockListResponse)
def search_stocks(
    q: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StockListResponse:
    stmt = select(Stock).where(Stock.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Stock.symbol.like(like), Stock.name.like(like)))
    stmt = stmt.limit(50)
    rows = db.scalars(stmt).all()
    rows = sorted(rows, key=lambda s: s.symbol)
    return StockListResponse(
        results=[
            StockOut(symbol=s.symbol, name=s.name, market=s.market.value)
            for s in rows
        ]
    )


@router.get("/{symbol}/quote", response_model=QuoteResponse)
def get_quote(
    symbol: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuoteResponse:
    stock = db.get(Stock, symbol)
    if stock is None:
        raise errors.stock_not_found()
    ensure_quotes_fresh(db, [symbol])
    qv = get_quote_view(db, symbol)
    return QuoteResponse(
        symbol=symbol,
        price=money_str(qv.price),
        as_of=_iso(qv.as_of),
        stale=qv.stale,
    )
