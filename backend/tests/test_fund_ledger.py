"""Fund-ledger feature tests: cash transactions + ledger math.

Run: .venv/bin/python -m pytest -q
"""
from __future__ import annotations

from decimal import Decimal

D = Decimal


def _member_ledger(client, auth, tok, club, member="me"):
    r = client.get(
        f"/api/clubs/{club}/holdings?member={member}", headers=auth(tok)
    )
    assert r.status_code == 200, r.text
    return r.json()["members"]


def _find_member(members, user_id):
    return next(m for m in members if m["user_id"] == user_id)


# --- Seed sanity: BUY/SELL untouched (existing behaviour preserved) -------


def test_existing_buy_holding_unchanged(client, tokens, auth, ids):
    members = _member_ledger(client, auth, tokens["alice"], ids["club"])
    alice = _find_member(members, ids["alice"])
    h2330 = next(h for h in alice["holdings"] if h["stock_symbol"] == "2330")
    assert h2330["quantity"] == 1000
    assert h2330["avg_cost"] == "2180.00"
    assert h2330["unrealized_pnl"] == "230000.00"
    assert h2330["market_value"] == "2410000.00"
    # New field: cost_basis = avg_cost * qty.
    assert h2330["cost_basis"] == "2180000.00"


# --- Ledger shape + seed reconciliation -----------------------------------


def test_member_ledger_shape_and_reconciliation(client, tokens, auth, ids):
    members = _member_ledger(client, auth, tokens["alice"], ids["club"])
    alice = _find_member(members, ids["alice"])
    led = alice["ledger"]

    # All ledger keys present.
    for key in (
        "net_deposit",
        "cost_basis",
        "cash_balance",
        "market_value",
        "unrealized_pnl",
        "realized_pnl",
        "total_assets",
        "return_pct",
    ):
        assert key in led, key

    # Alice: deposit 2,600,000; buys 2,410,000 → cash 190,000.
    assert led["net_deposit"] == "2600000.00"
    assert led["cash_balance"] == "190000.00"
    # cost_basis = 2330 (2,180,000) + 0050 (230,000).
    assert led["cost_basis"] == "2410000.00"

    # Reconciliation identity: total_assets − net_deposit == unrealized + realized.
    lhs = D(led["total_assets"]) - D(led["net_deposit"])
    rhs = D(led["unrealized_pnl"]) + D(led["realized_pnl"])
    assert lhs == rhs

    # total_assets = cash_balance + market_value.
    assert D(led["total_assets"]) == D(led["cash_balance"]) + D(led["market_value"])


def test_reconciliation_holds_for_all_members(client, tokens, auth, ids):
    members = _member_ledger(client, auth, tokens["alice"], ids["club"], member="all")
    seen = 0
    for m in members:
        led = m["ledger"]
        if D(led["net_deposit"]) <= 0:
            continue
        seen += 1
        lhs = D(led["total_assets"]) - D(led["net_deposit"])
        rhs = D(led["unrealized_pnl"]) + D(led["realized_pnl"])
        assert lhs == rhs, m["user_id"]
    assert seen >= 2  # at least Alice + Bob + Carol funded


def test_return_pct_null_when_no_deposit(client, tokens, auth, ids):
    # Dave (VIEWER) has no transactions → net_deposit 0 → return_pct null.
    members = _member_ledger(client, auth, tokens["dave"], ids["club"])
    dave = _find_member(members, ids["dave"])
    assert dave["ledger"]["net_deposit"] == "0.00"
    assert dave["ledger"]["return_pct"] is None


def test_carol_withdraw_reflected_in_net_deposit(client, tokens, auth, ids):
    members = _member_ledger(client, auth, tokens["carol"], ids["club"])
    carol = _find_member(members, ids["carol"])
    led = carol["ledger"]
    # 500,000 deposit − 50,000 withdraw = 450,000 net.
    assert led["net_deposit"] == "450000.00"
    # cash = 450,000 − buys(490,000+138,000) + sells(265,000) = 87,000.
    assert led["cash_balance"] == "87000.00"


# --- Cash transaction endpoint --------------------------------------------


def test_deposit_creates_cash_tx(client, tokens, auth, ids):
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["bob"]),
        json={"type": "DEPOSIT", "amount": "100000", "traded_at": "2026-06-19"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    tx = body["transaction"]
    assert tx["type"] == "DEPOSIT"
    assert tx["amount"] == "100000.00"
    assert tx["stock_symbol"] is None
    assert tx["quantity"] is None
    assert tx["price"] is None
    assert body["holding"] is None


def test_deposit_increases_cash_balance(client, tokens, auth, ids):
    before = _find_member(
        _member_ledger(client, auth, tokens["bob"], ids["club"]), ids["bob"]
    )["ledger"]["cash_balance"]
    client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["bob"]),
        json={"type": "DEPOSIT", "amount": "5000", "traded_at": "2026-06-19"},
    )
    after = _find_member(
        _member_ledger(client, auth, tokens["bob"], ids["club"]), ids["bob"]
    )["ledger"]["cash_balance"]
    assert D(after) - D(before) == D("5000")


def test_withdraw_within_balance(client, tokens, auth, ids):
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["alice"]),
        json={"type": "WITHDRAW", "amount": "1000", "traded_at": "2026-06-19"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["transaction"]["type"] == "WITHDRAW"


def test_withdraw_over_balance_rejected(client, tokens, auth, ids):
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["alice"]),
        json={
            "type": "WITHDRAW",
            "amount": "99999999",
            "traded_at": "2026-06-19",
        },
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_TRANSACTION_INPUT"


def test_deposit_amount_must_be_positive(client, tokens, auth, ids):
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["alice"]),
        json={"type": "DEPOSIT", "amount": "0", "traded_at": "2026-06-19"},
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_TRANSACTION_INPUT"


def test_viewer_cannot_deposit(client, tokens, auth, ids):
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["dave"]),
        json={"type": "DEPOSIT", "amount": "1000", "traded_at": "2026-06-19"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


# --- Transaction list includes cash rows ----------------------------------


def test_transaction_list_includes_cash_rows(client, tokens, auth, ids):
    r = client.get(
        f"/api/clubs/{ids['club']}/transactions", headers=auth(tokens["alice"])
    )
    assert r.status_code == 200
    txns = r.json()["transactions"]
    # Every row now carries a type.
    assert all("type" in t for t in txns)
    deposits = [t for t in txns if t["type"] == "DEPOSIT"]
    assert deposits, "expected seeded DEPOSIT rows"
    d = deposits[0]
    assert d["stock_symbol"] is None
    assert d["side"] is None
    assert d["quantity"] is None
    assert d["amount"] is not None
    # BUY/SELL rows still well-formed.
    buys = [t for t in txns if t["type"] == "BUY"]
    assert buys and buys[0]["side"] == "BUY"


def test_backward_compat_buy_via_side(client, tokens, auth, ids):
    """A BUY posted with only `side` (no `type`) still works."""
    r = client.post(
        f"/api/clubs/{ids['club']}/transactions",
        headers=auth(tokens["carol"]),
        json={
            "stock_symbol": "2412",
            "side": "BUY",
            "quantity": 100,
            "price": "140",
            "traded_at": "2026-06-19",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["transaction"]["type"] == "BUY"
    assert body["transaction"]["side"] == "BUY"
    assert body["holding"] is not None


# --- Summary club_ledger ---------------------------------------------------


def test_summary_has_club_ledger(client, tokens, auth, ids):
    r = client.get(
        f"/api/clubs/{ids['club']}/summary", headers=auth(tokens["alice"])
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "club_ledger" in body
    cl = body["club_ledger"]
    for key in (
        "net_deposit",
        "cost_basis",
        "cash_balance",
        "market_value",
        "unrealized_pnl",
        "realized_pnl",
        "total_assets",
        "return_pct",
    ):
        assert key in cl
    # by_symbol unchanged (still present, stock-only).
    assert "by_symbol" in body
    # club total_realized matches the legacy total_realized_pnl field.
    assert cl["realized_pnl"] == body["total_realized_pnl"]
    # club market_value matches legacy total_market_value.
    assert cl["market_value"] == body["total_market_value"]
