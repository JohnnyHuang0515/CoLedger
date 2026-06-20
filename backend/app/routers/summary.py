"""Club summary — aggregate over ACTIVE members only (FR-13, EC-6)."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import Membership, MembershipStatus, Stock, User
from ..schemas import SummaryBySymbol, SummaryResponse, money_str
from ..services import holdings_calc
from ..services.quotes_read import ensure_quotes_fresh, get_quote_view

router = APIRouter(prefix="/api/clubs", tags=["summary"])

ZERO = Decimal("0")


@router.get("/{club_id}/summary", response_model=SummaryResponse)
def get_summary(
    club_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SummaryResponse:
    require_club_member(club_id, current, db)

    active_members = db.scalars(
        select(Membership).where(
            Membership.club_id == club_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    ).all()

    # Refresh live quotes for every symbol held in the club (throttled).
    symbols = sorted(
        {
            s
            for m in active_members
            for s in holdings_calc.member_symbols(db, club_id, m.user_id)
        }
    )
    ensure_quotes_fresh(db, symbols)

    total_mv = ZERO
    total_unreal = ZERO
    total_real = ZERO

    # by_symbol aggregation
    sym_qty: dict[str, int] = {}
    sym_mv: dict[str, Decimal] = {}
    sym_unreal: dict[str, Decimal] = {}
    # Track whether ALL contributing positions for a symbol had a price.
    sym_priced: dict[str, bool] = {}

    for m in active_members:
        uid = m.user_id
        for symbol in holdings_calc.member_symbols(db, club_id, uid):
            h = holdings_calc.compute_holding(db, club_id, uid, symbol)
            total_real += h.realized_pnl
            sym_qty[symbol] = sym_qty.get(symbol, 0) + h.quantity

            qv = get_quote_view(db, symbol)
            if qv.price is not None:
                mv = qv.price * Decimal(h.quantity)
                unreal = (qv.price - h.avg_cost) * Decimal(h.quantity)
                total_mv += mv
                total_unreal += unreal
                sym_mv[symbol] = sym_mv.get(symbol, ZERO) + mv
                sym_unreal[symbol] = sym_unreal.get(symbol, ZERO) + unreal
                sym_priced.setdefault(symbol, True)
            else:
                sym_priced[symbol] = False
                sym_mv.setdefault(symbol, ZERO)
                sym_unreal.setdefault(symbol, ZERO)

    by_symbol: list[SummaryBySymbol] = []
    for symbol, qty in sym_qty.items():
        # Closed positions (net 0) don't belong in the current-holdings breakdown;
        # their realized P&L still counts in total_realized_pnl above.
        if qty == 0:
            continue
        stock = db.get(Stock, symbol)
        priced = sym_priced.get(symbol, False)
        by_symbol.append(
            SummaryBySymbol(
                stock_symbol=symbol,
                name=stock.name if stock else symbol,
                total_quantity=qty,
                total_market_value=money_str(sym_mv.get(symbol, ZERO))
                if priced
                else None,
                total_unrealized_pnl=money_str(sym_unreal.get(symbol, ZERO))
                if priced
                else None,
            )
        )
    # Sort by market value desc (熱門持股); unpriced last.
    by_symbol.sort(
        key=lambda x: Decimal(x.total_market_value) if x.total_market_value else ZERO,
        reverse=True,
    )

    return SummaryResponse(
        as_of=datetime.now(timezone.utc).isoformat(),
        total_market_value=money_str(total_mv),
        total_unrealized_pnl=money_str(total_unreal),
        total_realized_pnl=money_str(total_real),
        by_symbol=by_symbol,
    )
