"""ChangeLog writer (BR-8).

Callers add the ChangeLog row to the SAME db Session used for the entity
write, then commit once — guaranteeing atomicity (AC-15.1 / AC-EF.6).
This module only stages the row (db.add); it never commits.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from ..models import (
    ChangeAction,
    ChangeLog,
    Membership,
    Transaction,
)


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def transaction_snapshot(tx: Transaction) -> dict[str, Any]:
    """A serializable snapshot of a transaction for before/after."""
    return {
        "id": tx.id,
        "club_id": tx.club_id,
        "member_user_id": tx.member_user_id,
        "created_by_user_id": tx.created_by_user_id,
        "stock_symbol": tx.stock_symbol,
        "side": tx.side.value if hasattr(tx.side, "value") else tx.side,
        "quantity": tx.quantity,
        "price": _jsonable(tx.price),
        "traded_at": _jsonable(tx.traded_at),
        "is_opening_balance": tx.is_opening_balance,
        "note": tx.note,
        "status": tx.status.value if hasattr(tx.status, "value") else tx.status,
    }


def membership_snapshot(m: Membership) -> dict[str, Any]:
    return {
        "id": m.id,
        "club_id": m.club_id,
        "user_id": m.user_id,
        "role": m.role.value if hasattr(m.role, "value") else m.role,
        "status": m.status.value if hasattr(m.status, "value") else m.status,
    }


def stage_change_log(
    db: Session,
    *,
    club_id: str,
    actor_user_id: str,
    entity_type: str,
    entity_id: str,
    action: ChangeAction,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> ChangeLog:
    """Stage (db.add) a ChangeLog row in the current transaction.

    Does NOT commit — the caller commits the entity + log together.
    """
    log = ChangeLog(
        club_id=club_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before=before,
        after=after,
    )
    db.add(log)
    return log
