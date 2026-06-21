"""Fund ledger — per-member cash + position roll-up, derived live.

Nothing here is stored. Every figure is recomputed from the member's ACTIVE
transactions on each request, reusing the LOCKED moving-average engine in
`holdings_calc` for cost_basis / realized_pnl.

Definitions (all money as Decimal; callers stringify at the edge):

    net_deposit    = Σ DEPOSIT.amount − Σ WITHDRAW.amount
    cost_basis     = Σ (avg_cost × current_qty)             # 本金 of open positions
    cash_balance   = net_deposit − Σ BUY.amount + Σ SELL.amount
    market_value   = Σ market value of open positions       # priced symbols only
    unrealized_pnl = market_value − cost_basis              # over priced positions
    realized_pnl   = Σ holding.realized_pnl                 # 既有已實現
    total_assets   = cash_balance + market_value
    return_pct     = (unrealized_pnl + realized_pnl) / net_deposit
                     (None when net_deposit <= 0)

Reconciliation identity (holds when every held symbol is priced):
    total_assets − net_deposit == unrealized_pnl + realized_pnl
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Side, Transaction, TxStatus, TxType
from . import holdings_calc
from .quotes_read import get_quote_view

ZERO = Decimal("0")


@dataclass
class Ledger:
    """Derived fund ledger for one member (or, summed, for the whole club)."""

    net_deposit: Decimal = ZERO
    cost_basis: Decimal = ZERO
    cash_balance: Decimal = ZERO
    market_value: Decimal = ZERO
    unrealized_pnl: Decimal = ZERO
    realized_pnl: Decimal = ZERO
    total_assets: Decimal = ZERO

    @property
    def return_pct(self) -> Decimal | None:
        """(unrealized + realized) / net_deposit; None when net_deposit <= 0."""
        if self.net_deposit <= ZERO:
            return None
        return (self.unrealized_pnl + self.realized_pnl) / self.net_deposit


def _cash_flows(db: Session, club_id: str, member_user_id: str) -> tuple[Decimal, Decimal]:
    """Return (Σ deposits, Σ withdrawals) for a member's ACTIVE cash txns."""
    rows = db.scalars(
        select(Transaction).where(
            Transaction.club_id == club_id,
            Transaction.member_user_id == member_user_id,
            Transaction.status == TxStatus.ACTIVE,
            Transaction.type.in_((TxType.DEPOSIT, TxType.WITHDRAW)),
        )
    ).all()
    deposits = ZERO
    withdrawals = ZERO
    for tx in rows:
        amt = Decimal(tx.amount or 0)
        if tx.type == TxType.DEPOSIT:
            deposits += amt
        else:
            withdrawals += amt
    return deposits, withdrawals


def _trade_flows(db: Session, club_id: str, member_user_id: str) -> tuple[Decimal, Decimal]:
    """Return (Σ buy amount, Σ sell amount) for a member's ACTIVE stock txns."""
    rows = db.scalars(
        select(Transaction).where(
            Transaction.club_id == club_id,
            Transaction.member_user_id == member_user_id,
            Transaction.status == TxStatus.ACTIVE,
            Transaction.type.in_((TxType.BUY, TxType.SELL)),
        )
    ).all()
    buys = ZERO
    sells = ZERO
    for tx in rows:
        amt = Decimal(tx.quantity or 0) * Decimal(tx.price or 0)
        if tx.side == Side.BUY:
            buys += amt
        else:
            sells += amt
    return buys, sells


def compute_member_ledger(db: Session, club_id: str, member_user_id: str) -> Ledger:
    """Build the full ledger for one member from their ACTIVE transactions.

    Assumes quotes are already refreshed by the caller (holdings/summary routes
    call ensure_quotes_fresh before iterating members).
    """
    deposits, withdrawals = _cash_flows(db, club_id, member_user_id)
    buys, sells = _trade_flows(db, club_id, member_user_id)

    net_deposit = deposits - withdrawals
    cash_balance = net_deposit - buys + sells

    cost_basis = ZERO
    market_value = ZERO
    unrealized_pnl = ZERO
    realized_pnl = ZERO

    for symbol in holdings_calc.member_symbols(db, club_id, member_user_id):
        h = holdings_calc.compute_holding(db, club_id, member_user_id, symbol)
        realized_pnl += h.realized_pnl
        if h.quantity == 0:
            continue
        cb = h.avg_cost * Decimal(h.quantity)
        cost_basis += cb
        qv = get_quote_view(db, symbol)
        if qv.price is not None:
            mv = qv.price * Decimal(h.quantity)
            market_value += mv
            unrealized_pnl += mv - cb
        # Unpriced symbol: contributes to cost_basis but not market_value /
        # unrealized (mirrors holdings/summary "skip when no quote" behaviour).

    total_assets = cash_balance + market_value

    return Ledger(
        net_deposit=net_deposit,
        cost_basis=cost_basis,
        cash_balance=cash_balance,
        market_value=market_value,
        unrealized_pnl=unrealized_pnl,
        realized_pnl=realized_pnl,
        total_assets=total_assets,
    )


def sum_ledgers(ledgers: list[Ledger]) -> Ledger:
    """Aggregate per-member ledgers into a club-wide ledger.

    return_pct is recomputed from the club totals (it is a derived @property,
    so summing the components is enough).
    """
    total = Ledger()
    for led in ledgers:
        total.net_deposit += led.net_deposit
        total.cost_basis += led.cost_basis
        total.cash_balance += led.cash_balance
        total.market_value += led.market_value
        total.unrealized_pnl += led.unrealized_pnl
        total.realized_pnl += led.realized_pnl
        total.total_assets += led.total_assets
    return total
