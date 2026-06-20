"""Seed demo data — BUILD-CONTRACT §5 (LOCKED values).

Run standalone:   python -m app.seed   (drops & rebuilds demo data)
Also auto-runs on first startup if the DB is empty (see main.lifespan).

Demo accounts (password = demo1234):
  alice@demo.tw  Alice  — OWNER of 投資先鋒社
  bob@demo.tw    Bob    — MEMBER
  carol@demo.tw  Carol  — MEMBER
  dave@demo.tw   Dave   — VIEWER
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from .auth import hash_password
from .db import SessionLocal, engine, init_db
from .db import Base
from .models import (
    ChangeAction,
    Club,
    Invite,
    InviteStatus,
    Membership,
    MembershipStatus,
    Quote,
    Role,
    Side,
    Stock,
    Market,
    Transaction,
    TxStatus,
    User,
)
from .services.changelog import stage_change_log, transaction_snapshot
from .services.quote_provider import MOCK_PRICES

DEMO_PASSWORD = "demo1234"

# --- Stock master (§5) ---------------------------------------------------
STOCK_MASTER: list[tuple[str, str, Market]] = [
    ("2330", "台積電", Market.TWSE),
    ("2317", "鴻海", Market.TWSE),
    ("2454", "聯發科", Market.TWSE),
    ("2412", "中華電", Market.TWSE),
    ("0050", "元大台灣50", Market.TWSE),
    ("2603", "長榮", Market.TWSE),
    ("3008", "大立光", Market.TWSE),
    ("2308", "台達電", Market.TWSE),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _reset_schema() -> None:
    """Drop and recreate all tables (used by the standalone seed runner)."""
    Base.metadata.drop_all(bind=engine)
    init_db()


def seed_all(db: Session) -> None:
    """Idempotent-ish: assumes an empty (or freshly reset) DB."""
    # --- Users ---
    alice = User(
        email="alice@demo.tw",
        display_name="Alice",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    bob = User(
        email="bob@demo.tw",
        display_name="Bob",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    carol = User(
        email="carol@demo.tw",
        display_name="Carol",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    dave = User(
        email="dave@demo.tw",
        display_name="Dave",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add_all([alice, bob, carol, dave])
    db.flush()

    # --- Stock master ---
    for symbol, name, market in STOCK_MASTER:
        db.add(
            Stock(symbol=symbol, name=name, market=market, is_active=True)
        )
    db.flush()

    # --- Mock quotes (fixed prices §5) ---
    now = _now()
    for symbol, price in MOCK_PRICES.items():
        db.add(
            Quote(
                stock_symbol=symbol,
                price=price,
                as_of=now,
                fetched_at=now,
            )
        )

    # --- Club + memberships ---
    club = Club(name="投資先鋒社", owner_user_id=alice.id)
    db.add(club)
    db.flush()

    def membership(user: User, role: Role) -> None:
        db.add(
            Membership(
                club_id=club.id,
                user_id=user.id,
                role=role,
                status=MembershipStatus.ACTIVE,
                joined_at=now,
            )
        )

    membership(alice, Role.OWNER)
    membership(bob, Role.MEMBER)
    membership(carol, Role.MEMBER)
    membership(dave, Role.VIEWER)
    db.flush()

    # A demo invite link (reusable, MEMBER role) so the 成員管理 page shows the
    # feature populated. Owner can revoke / create more in the UI.
    db.add(
        Invite(
            club_id=club.id,
            role=Role.MEMBER,
            token="demo-join-member",
            status=InviteStatus.ACTIVE,
            created_by_user_id=alice.id,
        )
    )
    db.flush()

    # --- Anchor transactions (§5) ---
    def add_tx(
        member: User,
        creator: User,
        symbol: str,
        side: Side,
        qty: int,
        price: str,
        traded_at: date,
        *,
        opening: bool = False,
        note: str | None = None,
    ) -> Transaction:
        tx = Transaction(
            club_id=club.id,
            member_user_id=member.id,
            created_by_user_id=creator.id,
            stock_symbol=symbol,
            side=side,
            quantity=qty,
            price=Decimal(price),
            traded_at=traded_at,
            is_opening_balance=opening,
            note=note,
            status=TxStatus.ACTIVE,
        )
        db.add(tx)
        db.flush()
        # BR-8: every write gets a ChangeLog, actor = the recorder.
        stage_change_log(
            db,
            club_id=club.id,
            actor_user_id=creator.id,
            entity_type="Transaction",
            entity_id=tx.id,
            action=ChangeAction.CREATE,
            before=None,
            after=transaction_snapshot(tx),
        )
        return tx

    # Cost bases sit near the 2026-06-18 mock/real prices for a believable mix
    # of gains and losses (§5). Prices: 2330=2410, 0050=107.3, 2317=268.5,
    # 2412=144, 2454=4390, 2603=193.

    # 1) Alice 2330 BUY 1000 @2180 (期初持股) → 現價 2410 → 未實現 +230,000
    add_tx(
        alice, alice, "2330", Side.BUY, 1000, "2180",
        date(2026, 1, 6), opening=True, note="期初持股",
    )
    # Alice 0050 BUY 2000 @115 → unrealized (107.3-115)*2000 = -15,400 (小虧，做變化)
    add_tx(alice, alice, "0050", Side.BUY, 2000, "115", date(2026, 2, 10))

    # 2) SELL example for 本筆已實現:
    #    Carol BUY 2317 2000@245, then SELL 1000@265 → realized 1000*(265-245)=20,000
    add_tx(carol, carol, "2317", Side.BUY, 2000, "245", date(2026, 1, 20))
    add_tx(
        carol, carol, "2317", Side.SELL, 1000, "265",
        date(2026, 3, 15), note="獲利了結一半",
    )
    # Carol 2412 BUY 1000@138 → unrealized (144-138)*1000 = +6,000
    add_tx(carol, carol, "2412", Side.BUY, 1000, "138", date(2026, 2, 1))

    # 3) 代操 example: Alice (OWNER) records a tx attributed to Bob.
    #    member_user_id=Bob, created_by=Alice → is_proxy=true, changelog actor=Alice
    #    2454 BUY 100 @4100 → 現價 4390 → 未實現 +29,000
    add_tx(
        bob, alice, "2454", Side.BUY, 100, "4100",
        date(2026, 3, 1), note="團主代操：Alice 幫 Bob 登錄",
    )
    # Bob also has his own holding for variety. 2603 BUY 3000 @205 → -36,000 (小虧)
    add_tx(bob, bob, "2603", Side.BUY, 3000, "205", date(2026, 2, 18))

    db.commit()


def main() -> None:
    print("Resetting schema and seeding demo data...")
    _reset_schema()
    with SessionLocal() as db:
        seed_all(db)
    print("Seed complete.")
    print("Demo accounts (password=demo1234): alice@demo.tw / bob@demo.tw / "
          "carol@demo.tw / dave@demo.tw")


if __name__ == "__main__":
    main()
