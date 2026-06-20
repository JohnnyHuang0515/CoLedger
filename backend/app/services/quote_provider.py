"""Quote provider abstraction.

`QUOTE_PROVIDER=mock` (default): fixed deterministic prices from contract §5,
fully offline.
`QUOTE_PROVIDER=finmind`: best-effort hit FinMind delayed-quote API; on
failure, keep last cached quote (FR-10 / NFR-5) and let the read path mark
it stale.

Quotes are cached in the `quotes` table. Reads use the DB cache + a freshness
(stale) check; the provider is what refreshes that cache.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from ..config import settings

# Fixed mock prices — a snapshot of real 2026-06-18 closes so mock mode looks
# realistic & deterministic (BUILD-CONTRACT §5). Seed cost bases sit near these.
MOCK_PRICES: dict[str, Decimal] = {
    "2330": Decimal("2410"),
    "2317": Decimal("268.5"),
    "2454": Decimal("4390"),
    "2412": Decimal("144"),
    "0050": Decimal("107.3"),
    "2603": Decimal("193"),
    "3008": Decimal("5195"),
    "2308": Decimal("2150"),
}


@dataclass
class FetchedQuote:
    symbol: str
    price: Decimal
    as_of: datetime


class QuoteProvider:
    """Interface — implementations return FetchedQuote per symbol (best-effort)."""

    def fetch_quotes(self, symbols: list[str]) -> dict[str, FetchedQuote]:
        raise NotImplementedError


class MockQuoteProvider(QuoteProvider):
    """Deterministic offline prices. as_of = now (always fresh)."""

    def fetch_quotes(self, symbols: list[str]) -> dict[str, FetchedQuote]:
        now = datetime.now(timezone.utc)
        out: dict[str, FetchedQuote] = {}
        for s in symbols:
            if s in MOCK_PRICES:
                out[s] = FetchedQuote(symbol=s, price=MOCK_PRICES[s], as_of=now)
        return out


class FinMindQuoteProvider(QuoteProvider):
    """Best-effort real delayed quotes via FinMind.

    Docs: https://finmindtrade.com/  — dataset `TaiwanStockPriceTick` /
    `TaiwanStockPrice`. POC uses the daily close (`TaiwanStockPrice`) which
    works without intraday entitlement; swap the dataset for true delayed
    intraday if a token with that entitlement is provided.

    On ANY failure (timeout, non-200, parse error) we return {} so the caller
    keeps the last cached quote and the read path marks it stale (NFR-5).
    """

    API_URL = "https://api.finmindtrade.com/api/v4/data"
    DATASET = "TaiwanStockPrice"
    # Look back far enough to clear weekends / holidays and land on the most
    # recent trading day's close (querying only "today" returns nothing before
    # that session's data is published).
    LOOKBACK_DAYS = 14

    def fetch_quotes(self, symbols: list[str]) -> dict[str, FetchedQuote]:
        import httpx
        from datetime import timedelta

        out: dict[str, FetchedQuote] = {}
        start = (
            datetime.now(timezone.utc).date() - timedelta(days=self.LOOKBACK_DAYS)
        ).isoformat()
        for s in symbols:
            try:
                params = {
                    "dataset": self.DATASET,
                    "data_id": s,
                    "start_date": start,
                }
                if settings.FINMIND_TOKEN:
                    params["token"] = settings.FINMIND_TOKEN
                resp = httpx.get(self.API_URL, params=params, timeout=5.0)
                resp.raise_for_status()
                data = resp.json().get("data") or []
                if not data:
                    continue
                # Rows are date-ascending; take the most recent close.
                last = data[-1]
                price = Decimal(str(last.get("close") or last.get("close_price")))
                as_of = datetime.fromisoformat(last["date"]).replace(
                    tzinfo=timezone.utc
                )
                out[s] = FetchedQuote(symbol=s, price=price, as_of=as_of)
            except Exception:
                # Best-effort: skip this symbol, keep last cached quote.
                continue
        return out


def get_provider() -> QuoteProvider:
    if settings.QUOTE_PROVIDER == "finmind":
        return FinMindQuoteProvider()
    return MockQuoteProvider()
