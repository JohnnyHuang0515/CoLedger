"""Moving-average / gross P&L engine — BUILD-CONTRACT §3 (BR-4/5/6), LOCKED.

Holdings are DERIVED from ACTIVE transactions; there is no holdings table.
All money is Decimal; callers stringify at the edge.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import errors
from ..models import Side, Transaction, TxStatus

ZERO = Decimal("0")


@dataclass
class Holding:
    """Derived position for one (member, symbol)."""

    stock_symbol: str
    quantity: int = 0
    avg_cost: Decimal = ZERO
    realized_pnl: Decimal = ZERO  # cumulative (個股累計)


@dataclass
class ReplayResult:
    holding: Holding
    # tx_id -> 本筆已實現 (per-SELL realized_pnl); BUY entries get None.
    per_tx_realized: dict[str, Decimal | None] = field(default_factory=dict)


def _sorted_active_txns(
    db: Session, club_id: str, member_user_id: str, stock_symbol: str
) -> list[Transaction]:
    rows = db.scalars(
        select(Transaction).where(
            Transaction.club_id == club_id,
            Transaction.member_user_id == member_user_id,
            Transaction.stock_symbol == stock_symbol,
            Transaction.status == TxStatus.ACTIVE,
        )
    ).all()
    # Sort by traded_at then created_at (BUILD-CONTRACT §3).
    return sorted(rows, key=lambda t: (t.traded_at, t.created_at))


def replay(
    db: Session,
    club_id: str,
    member_user_id: str,
    stock_symbol: str,
    *,
    raise_on_oversell: bool = True,
) -> ReplayResult:
    """Walk a member's ACTIVE txns for one symbol, applying the locked algo.

    Raises INSUFFICIENT_HOLDING (422) if any SELL drives qty < 0 and
    raise_on_oversell is True (BR-3).
    """
    txns = _sorted_active_txns(db, club_id, member_user_id, stock_symbol)
    return _replay_list(txns, stock_symbol, raise_on_oversell)


def _replay_list(
    txns: list[Transaction], stock_symbol: str, raise_on_oversell: bool
) -> ReplayResult:
    qty = 0
    total_cost = ZERO
    realized = ZERO
    avg = ZERO
    per_tx: dict[str, Decimal | None] = {}

    for tx in txns:
        price = Decimal(tx.price)
        if tx.side == Side.BUY:
            total_cost += Decimal(tx.quantity) * price
            qty += tx.quantity
            avg = (total_cost / Decimal(qty)) if qty else ZERO
            per_tx[tx.id] = None  # 買入無本筆已實現
        else:  # SELL
            pnl = Decimal(tx.quantity) * (price - avg)  # ★本筆已實現
            per_tx[tx.id] = pnl
            realized += pnl
            qty -= tx.quantity
            if qty < 0 and raise_on_oversell:
                raise errors.insufficient_holding(
                    f"賣出超過當下持有 {qty + tx.quantity} 股",
                    details={
                        "stock_symbol": stock_symbol,
                        "conflicting_transaction_id": tx.id,
                        "available_quantity": qty + tx.quantity,
                        "attempted_sell_quantity": tx.quantity,
                    },
                )
            # avg unchanged; total_cost scales with remaining qty.
            total_cost = avg * Decimal(qty)

    holding = Holding(
        stock_symbol=stock_symbol,
        quantity=qty,
        avg_cost=avg,
        realized_pnl=realized,
    )
    return ReplayResult(holding=holding, per_tx_realized=per_tx)


def compute_holding(
    db: Session, club_id: str, member_user_id: str, stock_symbol: str
) -> Holding:
    """Convenience: just the derived Holding (used by POST/PATCH responses)."""
    return replay(db, club_id, member_user_id, stock_symbol).holding


def member_symbols(
    db: Session, club_id: str, member_user_id: str
) -> list[str]:
    """Distinct symbols this member has ANY active transaction in."""
    rows = db.scalars(
        select(Transaction.stock_symbol)
        .where(
            Transaction.club_id == club_id,
            Transaction.member_user_id == member_user_id,
            Transaction.status == TxStatus.ACTIVE,
        )
        .distinct()
    ).all()
    return list(rows)


def per_tx_realized_for_member_symbol(
    db: Session, club_id: str, member_user_id: str, stock_symbol: str
) -> dict[str, Decimal | None]:
    """Map of tx_id -> 本筆已實現 for transaction-list rendering.

    Does not raise on oversell (we're just labelling existing rows).
    """
    return replay(
        db,
        club_id,
        member_user_id,
        stock_symbol,
        raise_on_oversell=False,
    ).per_tx_realized
