"""Holdings route — personal (?member=me) or shared view (?member=all)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import Membership, MembershipStatus, Stock, User
from ..schemas import (
    HoldingFullOut,
    HoldingsResponse,
    MemberHoldingsOut,
    money_str,
)
from ..services import holdings_calc
from ..services.quotes_read import ensure_quotes_fresh, get_quote_view

router = APIRouter(prefix="/api/clubs", tags=["holdings"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def build_member_holdings(
    db: Session, club_id: str, user: User
) -> MemberHoldingsOut:
    """Compute all holdings for one member, enriched with quotes."""
    symbols = holdings_calc.member_symbols(db, club_id, user.id)
    out_holdings: list[HoldingFullOut] = []
    for symbol in symbols:
        h = holdings_calc.compute_holding(db, club_id, user.id, symbol)
        # Skip fully-closed positions (qty 0); their realized P&L lives in the
        # 總已實現 card + each SELL's 本筆 in the transaction list (three-tier design).
        if h.quantity == 0:
            continue
        stock = db.get(Stock, symbol)
        name = stock.name if stock else symbol
        qv = get_quote_view(db, symbol)

        if qv.price is None:
            price = market_value = unrealized = None
        else:
            price = qv.price
            market_value = price * Decimal(h.quantity)
            unrealized = (price - h.avg_cost) * Decimal(h.quantity)

        out_holdings.append(
            HoldingFullOut(
                stock_symbol=symbol,
                name=name,
                quantity=h.quantity,
                avg_cost=money_str(h.avg_cost),
                price=money_str(price),
                price_as_of=_iso(qv.as_of),
                stale=qv.stale,
                market_value=money_str(market_value),
                unrealized_pnl=money_str(unrealized),
                realized_pnl=money_str(h.realized_pnl),
            )
        )
    # Stable ordering by symbol for deterministic UI.
    out_holdings.sort(key=lambda x: x.stock_symbol)
    return MemberHoldingsOut(
        user_id=user.id, display_name=user.display_name, holdings=out_holdings
    )


@router.get("/{club_id}/holdings", response_model=HoldingsResponse)
def get_holdings(
    club_id: str,
    member: str | None = Query(default=None),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HoldingsResponse:
    ctx = require_club_member(club_id, current, db)

    if member == "me":
        target_users = [current]
    else:
        # all (default): every ACTIVE member (shared view, FR-12).
        rows = db.scalars(
            select(Membership).where(
                Membership.club_id == club_id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        ).all()
        target_users = [m.user for m in rows]

    # Refresh live quotes for all symbols in view (throttled; no-op for mock).
    symbols = sorted(
        {s for u in target_users for s in holdings_calc.member_symbols(db, club_id, u.id)}
    )
    ensure_quotes_fresh(db, symbols)

    members_out = [build_member_holdings(db, club_id, u) for u in target_users]
    return HoldingsResponse(as_of=_now_iso(), members=members_out)
