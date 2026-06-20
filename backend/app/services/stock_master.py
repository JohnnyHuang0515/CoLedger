"""Taiwan stock master list.

Syncs the real 上市/上櫃 symbol master so the symbol autocomplete (GET /api/stocks)
and validation (BR-9) cover every listed stock, not just the seed. Source: FinMind
`TaiwanStockInfo` (same provider as quotes). 興櫃 (emerging) is excluded — out of
scope (§1.5: 上市 TWSE / 上櫃 TPEX only).
"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import settings

FINMIND_URL = "https://api.finmindtrade.com/api/v4/data"
# FinMind `type` -> our Market enum value. "emerging" (興櫃) is intentionally dropped.
_TYPE_TO_MARKET = {"twse": "TWSE", "tpex": "TPEX"}


@dataclass
class StockRow:
    symbol: str
    name: str
    market: str  # "TWSE" | "TPEX"


def fetch_list() -> list[StockRow]:
    """Fetch the live TW listed-stock master from FinMind. Best-effort: returns
    [] on any failure so callers fall back to the seeded master."""
    import httpx

    try:
        params = {"dataset": "TaiwanStockInfo"}
        if settings.FINMIND_TOKEN:
            params["token"] = settings.FINMIND_TOKEN
        resp = httpx.get(FINMIND_URL, params=params, timeout=30.0)
        resp.raise_for_status()
        data = resp.json().get("data") or []
    except Exception:
        return []

    # One row per stock_id (dataset can repeat ids across dates); keep first seen.
    seen: dict[str, StockRow] = {}
    for d in data:
        market = _TYPE_TO_MARKET.get(d.get("type"))
        if market is None:
            continue
        symbol = str(d.get("stock_id") or "").strip()
        name = str(d.get("stock_name") or "").strip()
        if not symbol or symbol in seen:
            continue
        seen[symbol] = StockRow(symbol=symbol, name=name or symbol, market=market)
    return list(seen.values())


def sync_into_db(db) -> int:
    """Upsert fetch_list() rows into the stocks table (idempotent, §6.4.2).
    Returns count synced. Caller commits."""
    from ..models import Market, Stock

    rows = fetch_list()
    if not rows:
        return 0
    existing = {s.symbol: s for s in db.query(Stock).all()}
    new_objs = []
    for r in rows:
        market = Market(r.market)
        st = existing.get(r.symbol)
        if st is None:
            new_objs.append(
                Stock(symbol=r.symbol, name=r.name, market=market, is_active=True)
            )
        else:
            st.name = r.name
            st.market = market
            st.is_active = True
    db.add_all(new_objs)
    return len(rows)
