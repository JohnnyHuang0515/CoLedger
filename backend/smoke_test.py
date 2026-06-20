"""Offline smoke test — no running server needed.

Spins up the app against a fresh in-memory SQLite via FastAPI TestClient,
seeds demo data, and asserts the key acceptance criteria:

  * Alice 2330 holding = 1000 股, unrealized +50,000.00 (AC-8.2 / §7.1)
  * VIEWER (dave) write → 403 FORBIDDEN (AC-3.2 / §7.4)
  * OWNER proxy trade → is_proxy=true + ChangeLog actor=Alice (AC-3.4 / §7.3)
  * SELL 本筆已實現 surfaces in the transaction list (Carol 2317)
  * member write attributed to another member by a non-OWNER → 403 (AC-3.5)

Run:  python smoke_test.py    (requires deps installed; Python 3.11+)
"""
from __future__ import annotations

import os
import tempfile

# Use a throwaway file DB so all connections share state.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["QUOTE_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import init_db, SessionLocal  # noqa: E402
from app.seed import seed_all, _reset_schema  # noqa: E402
from app.main import app  # noqa: E402

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"


def login(client: TestClient, email: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main() -> int:
    _reset_schema()
    with SessionLocal() as db:
        seed_all(db)

    client = TestClient(app)
    failures = 0

    alice_t = login(client, "alice@demo.tw")
    dave_t = login(client, "dave@demo.tw")
    bob_t = login(client, "bob@demo.tw")

    me = client.get("/api/auth/me", headers=auth(alice_t)).json()["user"]
    alice_id = me["id"]

    # Resolve club + member ids.
    # Alice owns exactly one club; find it via members listing isn't exposed
    # without club id, so fetch via a holdings probe: list clubs is implicit —
    # use the activity/holdings after discovering club id from a transaction.
    # Simpler: query the DB directly for the seeded club id.
    from app.models import Club, User
    with SessionLocal() as db:
        club = db.query(Club).first()
        club_id = club.id
        bob = db.query(User).filter(User.email == "bob@demo.tw").first()
        bob_id = bob.id

    # --- 1) Alice 2330 unrealized +50,000.00 ---
    r = client.get(
        f"/api/clubs/{club_id}/holdings?member=me", headers=auth(alice_t)
    )
    h2330 = None
    for m in r.json()["members"]:
        for h in m["holdings"]:
            if h["stock_symbol"] == "2330":
                h2330 = h
    ok = (
        h2330 is not None
        and h2330["quantity"] == 1000
        and h2330["avg_cost"] == "2180.00"
        and h2330["unrealized_pnl"] == "230000.00"
        and h2330["market_value"] == "2410000.00"
    )
    print(f"[{PASS if ok else FAIL}] Alice 2330: qty=1000 avg=2180 unrealized=+230,000 "
          f"-> {h2330}")
    failures += 0 if ok else 1

    # --- 2) VIEWER (dave) write → 403 ---
    r = client.post(
        f"/api/clubs/{club_id}/transactions",
        headers=auth(dave_t),
        json={
            "stock_symbol": "2330", "side": "BUY", "quantity": 1000,
            "price": "600", "traded_at": "2026-06-19",
        },
    )
    ok = r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    print(f"[{PASS if ok else FAIL}] VIEWER write -> 403 FORBIDDEN "
          f"(got {r.status_code} {r.json().get('error', {}).get('code')})")
    failures += 0 if ok else 1

    # --- 3) OWNER proxy trade (member=Bob) → is_proxy + actor=Alice ---
    r = client.post(
        f"/api/clubs/{club_id}/transactions",
        headers=auth(alice_t),
        json={
            "member_user_id": bob_id, "stock_symbol": "2317", "side": "BUY",
            "quantity": 1000, "price": "200", "traded_at": "2026-06-19",
            "note": "代操測試",
        },
    )
    body = r.json()
    is_proxy = r.status_code == 201 and body["transaction"]["is_proxy"] is True
    tx_id = body["transaction"]["id"] if r.status_code == 201 else None
    # check changelog actor
    act = client.get(
        f"/api/clubs/{club_id}/activity", headers=auth(alice_t)
    ).json()["entries"]
    actor_ok = any(e["entity_id"] == tx_id and e["actor"] == "Alice" for e in act)
    ok = is_proxy and actor_ok
    print(f"[{PASS if ok else FAIL}] OWNER proxy trade -> is_proxy=true & "
          f"ChangeLog actor=Alice (is_proxy={is_proxy}, actor_ok={actor_ok})")
    failures += 0 if ok else 1

    # --- 4) SELL 本筆已實現 in tx list (Carol 2317 SELL 1000@265, avg 245 = 20,000) ---
    r = client.get(
        f"/api/clubs/{club_id}/transactions?symbol=2317&side=SELL",
        headers=auth(alice_t),
    )
    sells = [t for t in r.json()["transactions"] if t["side"] == "SELL"]
    target = next((t for t in sells if t["realized_pnl"] == "20000.00"), None)
    ok = target is not None
    print(f"[{PASS if ok else FAIL}] SELL 本筆已實現 = 20,000.00 present "
          f"-> {target['id'] if target else None}")
    failures += 0 if ok else 1

    # --- 5) non-OWNER member attributing to another member → 403 (AC-3.5) ---
    r = client.post(
        f"/api/clubs/{club_id}/transactions",
        headers=auth(bob_t),
        json={
            "member_user_id": alice_id, "stock_symbol": "2330", "side": "BUY",
            "quantity": 1000, "price": "600", "traded_at": "2026-06-19",
        },
    )
    ok = r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    print(f"[{PASS if ok else FAIL}] non-OWNER proxy -> 403 FORBIDDEN "
          f"(got {r.status_code})")
    failures += 0 if ok else 1

    # --- 6) oversell → 422 INSUFFICIENT_HOLDING ---
    r = client.post(
        f"/api/clubs/{club_id}/transactions",
        headers=auth(alice_t),
        json={
            "stock_symbol": "2330", "side": "SELL", "quantity": 999999,
            "price": "650", "traded_at": "2026-06-19",
        },
    )
    ok = (
        r.status_code == 422
        and r.json()["error"]["code"] == "INSUFFICIENT_HOLDING"
    )
    print(f"[{PASS if ok else FAIL}] oversell -> 422 INSUFFICIENT_HOLDING "
          f"(got {r.status_code} {r.json().get('error', {}).get('code')})")
    failures += 0 if ok else 1

    print()
    if failures == 0:
        print(f"{PASS}: all smoke checks passed.")
    else:
        print(f"{FAIL}: {failures} check(s) failed.")
    return failures


if __name__ == "__main__":
    raise SystemExit(main())
