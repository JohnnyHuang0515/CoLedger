"""Transaction routes — core ledger (FR-4/5/14, BR-1/2/3/7/9/13)."""
from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import errors
from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import (
    ChangeAction,
    Membership,
    MembershipStatus,
    Side,
    Stock,
    Transaction,
    TxStatus,
    TxType,
    User,
)
from ..schemas import (
    CreateTransactionRequest,
    CreateTransactionResponse,
    HoldingShortOut,
    PatchTransactionRequest,
    TransactionListItem,
    TransactionListResponse,
    TransactionOut,
    money_str,
)
from ..services import holdings_calc, ledger_calc
from ..services.changelog import stage_change_log, transaction_snapshot

router = APIRouter(prefix="/api/clubs", tags=["transactions"])

ZERO = Decimal("0")


def _amount(quantity: int, price: Decimal) -> Decimal:
    return Decimal(quantity) * Decimal(price)


def _is_cash(tx_type: TxType) -> bool:
    return tx_type in (TxType.DEPOSIT, TxType.WITHDRAW)


def _tx_amount(tx: Transaction) -> Decimal:
    """Money moved by a tx: cash amount for DEPOSIT/WITHDRAW, qty×price else."""
    if _is_cash(tx.type):
        return Decimal(tx.amount or 0)
    return _amount(tx.quantity or 0, tx.price or 0)


def _tx_out(tx: Transaction) -> TransactionOut:
    cash = _is_cash(tx.type)
    return TransactionOut(
        id=tx.id,
        type=tx.type.value,
        stock_symbol=None if cash else tx.stock_symbol,
        side=None if cash else (tx.side.value if tx.side else None),
        quantity=None if cash else tx.quantity,
        price=None if cash else money_str(Decimal(tx.price)),
        amount=money_str(_tx_amount(tx)),
        traded_at=tx.traded_at.isoformat(),
        status=tx.status.value,
        member_user_id=tx.member_user_id,
        created_by_user_id=tx.created_by_user_id,
        is_proxy=tx.member_user_id != tx.created_by_user_id,
    )


def _holding_short(h: holdings_calc.Holding) -> HoldingShortOut:
    return HoldingShortOut(
        stock_symbol=h.stock_symbol,
        quantity=h.quantity,
        avg_cost=money_str(h.avg_cost),
        realized_pnl=money_str(h.realized_pnl),
    )


def _validate_stock(db: Session, symbol: str) -> Stock:
    stock = db.get(Stock, symbol)
    if stock is None or not stock.is_active:
        raise errors.invalid_transaction_input(
            "代號不存在或已下市", details={"field": "stock_symbol", "value": symbol}
        )
    return stock


@router.post(
    "/{club_id}/transactions",
    status_code=201,
    response_model=CreateTransactionResponse,
)
def create_transaction(
    club_id: str,
    body: CreateTransactionRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateTransactionResponse:
    ctx = require_club_member(club_id, current, db)

    # VIEWER cannot write (BR-7, AC-3.2).
    if ctx.is_viewer:
        raise errors.forbidden("VIEWER 不可寫入交易")

    # Resolve 歸屬成員 (member_user_id); default = caller.
    member_user_id = body.member_user_id or current.id
    is_proxy = member_user_id != current.id

    if is_proxy:
        # 代操 only OWNER (BR-13, AC-3.4/3.5).
        if not ctx.is_owner:
            raise errors.forbidden("僅團主可代操（代他人登錄交易）")
        # member must be an ACTIVE member of this club (BR-13).
        target = db.scalar(
            select(Membership).where(
                Membership.club_id == club_id,
                Membership.user_id == member_user_id,
                Membership.status == MembershipStatus.ACTIVE,
            )
        )
        if target is None:
            raise errors.invalid_transaction_input(
                "歸屬成員不是此社團的有效成員",
                details={"field": "member_user_id", "value": member_user_id},
            )

    # Resolve transaction type. `type` is authoritative; fall back to `side`
    # for backward-compatible BUY/SELL callers that omit it.
    raw_type = body.type or body.side
    if raw_type not in ("BUY", "SELL", "DEPOSIT", "WITHDRAW"):
        raise errors.invalid_transaction_input(
            "type 僅能為 BUY / SELL / DEPOSIT / WITHDRAW",
            details={"field": "type", "value": raw_type},
        )
    tx_type = TxType(raw_type)

    if tx_type in (TxType.DEPOSIT, TxType.WITHDRAW):
        return _create_cash(db, club_id, current, member_user_id, tx_type, body)
    return _create_stock(db, club_id, current, member_user_id, tx_type, body)


def _create_stock(
    db: Session,
    club_id: str,
    current: User,
    member_user_id: str,
    tx_type: TxType,
    body: CreateTransactionRequest,
) -> CreateTransactionResponse:
    # Input validation (BR-1, BR-2).
    if body.quantity is None or body.quantity <= 0:
        raise errors.invalid_transaction_input(
            "數量須為正整數", details={"field": "quantity"}
        )
    if body.price is None or Decimal(body.price) <= 0:
        raise errors.invalid_transaction_input(
            "成交價須大於 0", details={"field": "price"}
        )
    if not body.stock_symbol:
        raise errors.invalid_transaction_input(
            "缺少股票代號", details={"field": "stock_symbol"}
        )
    _validate_stock(db, body.stock_symbol)

    tx = Transaction(
        club_id=club_id,
        member_user_id=member_user_id,
        created_by_user_id=current.id,
        type=tx_type,
        stock_symbol=body.stock_symbol,
        side=Side(tx_type.value),
        quantity=body.quantity,
        price=Decimal(body.price),
        traded_at=body.traded_at,
        is_opening_balance=body.is_opening_balance,
        note=body.note,
        status=TxStatus.ACTIVE,
    )
    db.add(tx)
    db.flush()  # assign tx.id; visible to the replay below

    # Oversell check via full replay (BR-3). Raises INSUFFICIENT_HOLDING.
    holding = holdings_calc.compute_holding(
        db, club_id, member_user_id, body.stock_symbol
    )

    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Transaction",
        entity_id=tx.id,
        action=ChangeAction.CREATE,
        before=None,
        after=transaction_snapshot(tx),
    )
    db.commit()
    db.refresh(tx)
    return CreateTransactionResponse(
        transaction=_tx_out(tx), holding=_holding_short(holding)
    )


def _create_cash(
    db: Session,
    club_id: str,
    current: User,
    member_user_id: str,
    tx_type: TxType,
    body: CreateTransactionRequest,
) -> CreateTransactionResponse:
    # amount must be a positive number; no symbol/qty/price for cash.
    if body.amount is None or Decimal(body.amount) <= 0:
        raise errors.invalid_transaction_input(
            "金額須大於 0", details={"field": "amount"}
        )
    amount = Decimal(body.amount)

    # WITHDRAW cannot exceed the member's current cash balance.
    if tx_type == TxType.WITHDRAW:
        ledger = ledger_calc.compute_member_ledger(db, club_id, member_user_id)
        if amount > ledger.cash_balance:
            raise errors.invalid_transaction_input(
                "出金金額超過現金餘額",
                details={
                    "field": "amount",
                    "attempted_withdraw": money_str(amount),
                    "cash_balance": money_str(ledger.cash_balance),
                },
            )

    tx = Transaction(
        club_id=club_id,
        member_user_id=member_user_id,
        created_by_user_id=current.id,
        type=tx_type,
        stock_symbol=None,
        side=None,
        quantity=None,
        price=None,
        amount=amount,
        traded_at=body.traded_at,
        is_opening_balance=body.is_opening_balance,
        note=body.note,
        status=TxStatus.ACTIVE,
    )
    db.add(tx)
    db.flush()

    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Transaction",
        entity_id=tx.id,
        action=ChangeAction.CREATE,
        before=None,
        after=transaction_snapshot(tx),
    )
    db.commit()
    db.refresh(tx)
    # Cash touches no stock position → holding is null.
    return CreateTransactionResponse(transaction=_tx_out(tx), holding=None)


def _load_owned_tx(
    db: Session, club_id: str, tx_id: str, current: User
) -> Transaction:
    """Load an ACTIVE tx and enforce ownership (BR-7)."""
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == tx_id,
            Transaction.club_id == club_id,
            Transaction.status == TxStatus.ACTIVE,
        )
    )
    if tx is None:
        raise errors.transaction_not_found()
    # Owner of the tx = the recorder (created_by) OR the attributed member.
    if current.id not in (tx.created_by_user_id, tx.member_user_id):
        raise errors.forbidden("非本人交易，不可編輯或刪除")
    return tx


@router.patch(
    "/{club_id}/transactions/{tx_id}", response_model=CreateTransactionResponse
)
def patch_transaction(
    club_id: str,
    tx_id: str,
    body: PatchTransactionRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateTransactionResponse:
    ctx = require_club_member(club_id, current, db)
    if ctx.is_viewer:
        raise errors.forbidden("VIEWER 不可編輯交易")
    tx = _load_owned_tx(db, club_id, tx_id, current)

    before = transaction_snapshot(tx)

    if _is_cash(tx.type):
        # Cash txns: only amount / traded_at / note are editable.
        if body.amount is not None:
            if Decimal(body.amount) <= 0:
                raise errors.invalid_transaction_input("金額須大於 0")
            tx.amount = Decimal(body.amount)
        if body.traded_at is not None:
            tx.traded_at = body.traded_at
        if body.note is not None:
            tx.note = body.note
        db.flush()
        # A WITHDRAW must not drive cash below zero after the edit.
        if tx.type == TxType.WITHDRAW:
            ledger = ledger_calc.compute_member_ledger(
                db, club_id, tx.member_user_id
            )
            if ledger.cash_balance < ZERO:
                raise errors.invalid_transaction_input(
                    "出金金額超過現金餘額",
                    details={"field": "amount"},
                )
        holding = None
    else:
        if body.quantity is not None:
            if body.quantity <= 0:
                raise errors.invalid_transaction_input("數量須為正整數")
            tx.quantity = body.quantity
        if body.price is not None:
            if Decimal(body.price) <= 0:
                raise errors.invalid_transaction_input("成交價須大於 0")
            tx.price = Decimal(body.price)
        if body.traded_at is not None:
            tx.traded_at = body.traded_at
        if body.note is not None:
            tx.note = body.note

        db.flush()
        # Re-replay; if edit makes a later SELL go negative → INSUFFICIENT_HOLDING.
        holding = holdings_calc.compute_holding(
            db, club_id, tx.member_user_id, tx.stock_symbol
        )

    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Transaction",
        entity_id=tx.id,
        action=ChangeAction.UPDATE,
        before=before,
        after=transaction_snapshot(tx),
    )
    db.commit()
    db.refresh(tx)
    return CreateTransactionResponse(
        transaction=_tx_out(tx),
        holding=_holding_short(holding) if holding is not None else None,
    )


@router.delete(
    "/{club_id}/transactions/{tx_id}", response_model=CreateTransactionResponse
)
def delete_transaction(
    club_id: str,
    tx_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateTransactionResponse:
    ctx = require_club_member(club_id, current, db)
    if ctx.is_viewer:
        raise errors.forbidden("VIEWER 不可刪除交易")
    tx = _load_owned_tx(db, club_id, tx_id, current)

    before = transaction_snapshot(tx)
    tx.status = TxStatus.DELETED
    db.flush()
    if _is_cash(tx.type):
        holding = None
    else:
        # After removing this tx, later SELLs must still be valid (BR-3 / EF-5).
        holding = holdings_calc.compute_holding(
            db, club_id, tx.member_user_id, tx.stock_symbol
        )

    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Transaction",
        entity_id=tx.id,
        action=ChangeAction.DELETE,
        before=before,
        after=None,
    )
    db.commit()
    db.refresh(tx)
    return CreateTransactionResponse(
        transaction=_tx_out(tx),
        holding=_holding_short(holding) if holding is not None else None,
    )


@router.get("/{club_id}/transactions", response_model=TransactionListResponse)
def list_transactions(
    club_id: str,
    member: str | None = Query(default=None),
    symbol: str | None = Query(default=None),
    side: str | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionListResponse:
    require_club_member(club_id, current, db)

    stmt = select(Transaction).where(
        Transaction.club_id == club_id,
        Transaction.status == TxStatus.ACTIVE,
    )
    if member:
        target_member = current.id if member == "me" else member
        stmt = stmt.where(Transaction.member_user_id == target_member)
    if symbol:
        stmt = stmt.where(Transaction.stock_symbol == symbol)
    if side in ("BUY", "SELL"):
        stmt = stmt.where(Transaction.side == Side(side))
    if from_:
        stmt = stmt.where(Transaction.traded_at >= date_type.fromisoformat(from_))
    if to:
        stmt = stmt.where(Transaction.traded_at <= date_type.fromisoformat(to))

    txns = db.scalars(stmt).all()
    # Default ordering: traded_at newest first (AC-14.1), then created_at desc.
    txns = sorted(txns, key=lambda t: (t.traded_at, t.created_at), reverse=True)

    # Build per-tx 本筆已實現 by replaying each (member, symbol) once.
    realized_cache: dict[tuple[str, str], dict[str, Decimal | None]] = {}
    user_cache: dict[str, User] = {}
    stock_cache: dict[str, Stock] = {}

    def _user(uid: str) -> User:
        if uid not in user_cache:
            user_cache[uid] = db.get(User, uid)
        return user_cache[uid]

    def _stock_name(sym: str) -> str:
        if sym not in stock_cache:
            stock_cache[sym] = db.get(Stock, sym)
        s = stock_cache[sym]
        return s.name if s else sym

    items: list[TransactionListItem] = []
    for tx in txns:
        cash = _is_cash(tx.type)
        if cash:
            per_tx_realized = None
        else:
            key = (tx.member_user_id, tx.stock_symbol)
            if key not in realized_cache:
                realized_cache[key] = (
                    holdings_calc.per_tx_realized_for_member_symbol(
                        db, club_id, tx.member_user_id, tx.stock_symbol
                    )
                )
            per_tx_realized = realized_cache[key].get(tx.id)
        member_user = _user(tx.member_user_id)
        creator = _user(tx.created_by_user_id)
        items.append(
            TransactionListItem(
                id=tx.id,
                member_user_id=tx.member_user_id,
                member_name=member_user.display_name if member_user else "",
                created_by_user_id=tx.created_by_user_id,
                created_by_name=creator.display_name if creator else "",
                is_proxy=tx.member_user_id != tx.created_by_user_id,
                type=tx.type.value,
                stock_symbol=None if cash else tx.stock_symbol,
                name=None if cash else _stock_name(tx.stock_symbol),
                side=None if cash else (tx.side.value if tx.side else None),
                quantity=None if cash else tx.quantity,
                price=None if cash else money_str(Decimal(tx.price)),
                amount=money_str(_tx_amount(tx)),
                traded_at=tx.traded_at.isoformat(),
                realized_pnl=money_str(per_tx_realized)
                if per_tx_realized is not None
                else None,
                note=tx.note,
                status=tx.status.value,
            )
        )
    return TransactionListResponse(transactions=items)
