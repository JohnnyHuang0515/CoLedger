"""Sync the full TW listed-stock master into the DB.

Run:  python -m app.sync_stocks
Populates the `stocks` table from FinMind TaiwanStockInfo so the symbol
autocomplete + validation cover every 上市/上櫃 stock.
"""
from __future__ import annotations

from .db import SessionLocal, init_db
from .services.stock_master import sync_into_db


def main() -> None:
    init_db()
    with SessionLocal() as db:
        count = sync_into_db(db)
        db.commit()
    print(f"Stock master synced: {count} 上市/上櫃 symbols.")


if __name__ == "__main__":
    main()
