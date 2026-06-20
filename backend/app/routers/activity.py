"""Activity / change log feed (FR-15)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import ChangeLog, Stock, User
from ..schemas import ActivityEntry, ActivityPage, ActivityResponse

router = APIRouter(prefix="/api/clubs", tags=["activity"])

_SIDE_ZH = {"BUY": "買", "SELL": "賣"}
_ACTION_ZH = {"CREATE": "新增", "UPDATE": "修改", "DELETE": "刪除"}
_ROLE_ZH = {"OWNER": "團主", "MEMBER": "成員", "VIEWER": "唯讀"}


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _fmt_qty(q) -> str:
    try:
        return f"{int(q):,}"
    except (TypeError, ValueError):
        return str(q)


def _build_summary(action, entity_type, snap, user_name, stock_name) -> str:
    """A readable 中文 one-liner with IDs resolved to names (no raw UUIDs)."""
    act = _ACTION_ZH.get(action, action)
    if entity_type == "Transaction":
        sym = snap.get("stock_symbol", "")
        side = _SIDE_ZH.get(snap.get("side"), snap.get("side") or "")
        base = f"{act}交易：{stock_name(sym)}（{sym}）{side} {_fmt_qty(snap.get('quantity'))} 股"
        if snap.get("price") is not None:
            base += f" @ {snap['price']}"
        member = snap.get("member_user_id")
        creator = snap.get("created_by_user_id")
        if member and creator and member != creator:
            base += f"（代操：{user_name(creator)} 幫 {user_name(member)} 登錄）"
        return base
    if entity_type == "Membership":
        role = _ROLE_ZH.get(snap.get("role"), snap.get("role") or "")
        who = user_name(snap.get("user_id")) if snap.get("user_id") else ""
        return f"{act}成員：{who}（{role}）"
    return f"{act} {entity_type}"


@router.get("/{club_id}/activity", response_model=ActivityResponse)
def get_activity(
    club_id: str,
    member: str | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityResponse:
    require_club_member(club_id, current, db)

    stmt = select(ChangeLog).where(ChangeLog.club_id == club_id)
    if from_:
        stmt = stmt.where(
            ChangeLog.created_at >= datetime.fromisoformat(from_)
        )
    if to:
        stmt = stmt.where(ChangeLog.created_at <= datetime.fromisoformat(to))

    rows = db.scalars(stmt).all()
    rows = sorted(rows, key=lambda r: r.created_at, reverse=True)

    # Filter by member = "anything involving this member": they performed it, OR
    # the snapshot is about them — the 歸屬成員 of a 代操 transaction
    # (member_user_id) or the subject of a membership change (user_id).
    if member:

        def _involves(r: ChangeLog) -> bool:
            if r.actor_user_id == member:
                return True
            for snap in (r.after, r.before):
                if isinstance(snap, dict) and (
                    snap.get("member_user_id") == member
                    or snap.get("user_id") == member
                ):
                    return True
            return False

        rows = [r for r in rows if _involves(r)]

    # Resolve user display names + stock names (cached).
    name_cache: dict[str, str] = {}
    stock_cache: dict[str, str] = {}

    def user_name(uid) -> str:
        if not uid:
            return ""
        if uid not in name_cache:
            u = db.get(User, uid)
            name_cache[uid] = u.display_name if u else str(uid)
        return name_cache[uid]

    def stock_name(symbol) -> str:
        if not symbol:
            return ""
        if symbol not in stock_cache:
            s = db.get(Stock, symbol)
            stock_cache[symbol] = s.name if s else str(symbol)
        return stock_cache[symbol]

    entries = [
        ActivityEntry(
            id=r.id,
            actor=user_name(r.actor_user_id),
            summary=_build_summary(
                r.action.value,
                r.entity_type,
                r.after or r.before or {},
                user_name,
                stock_name,
            ),
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            action=r.action.value,
            before=r.before,
            after=r.after,
            created_at=_iso(r.created_at),
        )
        for r in rows
    ]
    return ActivityResponse(entries=entries, page=ActivityPage(next=None))
