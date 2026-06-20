"""ORM models — mirrors BUILD-CONTRACT §2 schema.

Holding is NOT a table; it is derived live (see services/holdings_calc.py).
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- Enums ---------------------------------------------------------------


class Role(str, enum.Enum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class MembershipStatus(str, enum.Enum):
    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    REMOVED = "REMOVED"


class Side(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class TxStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    DELETED = "DELETED"


class Market(str, enum.Enum):
    TWSE = "TWSE"
    TPEX = "TPEX"


class ChangeAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class InviteStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


# --- Models --------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("club_id", "user_id", name="uq_club_user"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    club_id: Mapped[str] = mapped_column(String, ForeignKey("clubs.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), nullable=False)
    status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus), nullable=False, default=MembershipStatus.INVITED
    )
    invite_token: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship("User", lazy="joined")


class Stock(Base):
    __tablename__ = "stocks"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    market: Mapped[Market] = mapped_column(Enum(Market), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Quote(Base):
    __tablename__ = "quotes"

    stock_symbol: Mapped[str] = mapped_column(
        String, ForeignKey("stocks.symbol"), primary_key=True
    )
    price: Mapped[object] = mapped_column(Numeric(18, 4), nullable=False)
    as_of: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    club_id: Mapped[str] = mapped_column(String, ForeignKey("clubs.id"), nullable=False)
    # 歸屬成員 — position / pnl accrues here.
    member_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    # 登錄者 — who actually recorded it (proxy/代操 when != member_user_id).
    created_by_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    stock_symbol: Mapped[str] = mapped_column(
        String, ForeignKey("stocks.symbol"), nullable=False
    )
    side: Mapped[Side] = mapped_column(Enum(Side), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[object] = mapped_column(Numeric(18, 4), nullable=False)
    traded_at: Mapped[date] = mapped_column(Date, nullable=False)
    is_opening_balance: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[TxStatus] = mapped_column(
        Enum(TxStatus), nullable=False, default=TxStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Invite(Base):
    """A reusable, revocable invite link for a club at a fixed role.

    Many users can join via the same token until it is revoked. Joining
    creates/reactivates an ACTIVE Membership for the accepting user.
    """

    __tablename__ = "invites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    club_id: Mapped[str] = mapped_column(String, ForeignKey("clubs.id"), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    status: Mapped[InviteStatus] = mapped_column(
        Enum(InviteStatus), nullable=False, default=InviteStatus.ACTIVE
    )
    created_by_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ChangeLog(Base):
    __tablename__ = "change_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    club_id: Mapped[str] = mapped_column(String, ForeignKey("clubs.id"), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[ChangeAction] = mapped_column(Enum(ChangeAction), nullable=False)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
