import { motion } from 'motion/react';
import type { HoldingRow } from '../api/types';
import { formatMoney, formatPrice, formatQty } from '../lib/format';
import { PnLPill } from './PnLPill';
import { StaleBadge } from './StaleBadge';
import { useFlashOnChange } from '../hooks/useFlashOnChange';
import { listContainer, listItem } from '../lib/motionPresets';

interface HoldingTableProps {
  holdings: HoldingRow[];
}

// Grid (not <table>) so motion `layout` can smoothly slide rows when the sort
// order changes after a quote update; ARIA roles keep table semantics for AT.
const COLS = 'grid-cols-[1.5fr_0.9fr_0.9fr_1.2fr_1fr_1fr]';

// C-2 持股部位表 — 持股表只列未實現損益 (已實現見總覽卡 / 交易列本筆).
// 代號+名稱、持有股數、平均成本、現價(含 C-8)、市值、未實現損益.
export function HoldingTable({ holdings }: HoldingTableProps) {
  // sort by market value desc (no quote -> bottom)
  const sorted = [...holdings].sort((a, b) => {
    const av = a.market_value === null ? -1 : Number(a.market_value);
    const bv = b.market_value === null ? -1 : Number(b.market_value);
    return bv - av;
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] text-sm" role="table" aria-label="持股部位">
        <div
          role="row"
          className={`grid ${COLS} border-b border-border px-4 py-3 text-xs font-medium text-text-muted`}
        >
          <div role="columnheader">股票</div>
          <div role="columnheader" className="text-right">持有股數</div>
          <div role="columnheader" className="text-right">平均成本</div>
          <div role="columnheader" className="text-right">現價</div>
          <div role="columnheader" className="text-right">市值</div>
          <div role="columnheader" className="text-right">未實現損益</div>
        </div>
        <motion.div role="rowgroup" variants={listContainer} initial="hidden" animate="show">
          {sorted.map((h) => (
            <HoldingRowItem key={h.stock_symbol} h={h} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function HoldingRowItem({ h }: { h: HoldingRow }) {
  const noQuote = h.price === null;
  // Flash the row green/red when this holding's price changes between refetches.
  const flash = useFlashOnChange(h.price);

  return (
    <motion.div
      layout
      variants={listItem}
      onAnimationEnd={flash.onAnimationEnd}
      role="row"
      className={`grid ${COLS} items-center border-b border-border/60 px-4 py-3 transition-colors hover:bg-subtle/50 ${flash.className}`}
    >
      <div role="cell">
        <div className="font-medium text-text-primary">{h.stock_symbol}</div>
        <div className="text-xs text-text-secondary">{h.name}</div>
      </div>
      <div role="cell" className="text-right tabular-nums">
        {formatQty(h.quantity)}
      </div>
      <div role="cell" className="text-right tabular-nums">
        {formatPrice(h.avg_cost)}
      </div>
      <div role="cell" className="flex items-center justify-end gap-2">
        <span className="tabular-nums">{formatPrice(h.price)}</span>
        <StaleBadge stale={h.stale} priceAsOf={h.price_as_of} noData={noQuote} />
      </div>
      <div role="cell" className="text-right tabular-nums">
        {h.market_value === null ? (
          <span className="text-text-muted">N/A</span>
        ) : (
          formatMoney(h.market_value)
        )}
      </div>
      <div role="cell" className="text-right">
        {h.unrealized_pnl === null ? (
          <span className="text-text-muted">N/A</span>
        ) : (
          <PnLPill value={h.unrealized_pnl} />
        )}
      </div>
    </motion.div>
  );
}
