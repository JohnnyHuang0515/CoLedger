import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { HoldingRow } from '../api/types';
import {
  formatLots,
  formatMoney,
  formatPrice,
  formatQty,
  formatSignedMoney,
  formatSignedPercent,
  pnlSign,
  unrealizedPct,
} from '../lib/format';
import { PnLPill } from './PnLPill';
import { StaleBadge } from './StaleBadge';
import { useFlashOnChange } from '../hooks/useFlashOnChange';
import { listContainer, listItem } from '../lib/motionPresets';

interface HoldingTableProps {
  holdings: HoldingRow[];
  // mobile rendering: 'full' = one card per holding (個人總覽); 'condensed' = compact rows (社團共享).
  variant?: 'full' | 'condensed';
}

// Grid (not <table>) so motion `layout` can smoothly slide rows when the sort
// order changes after a quote update; ARIA roles keep table semantics for AT.
// 欄：股票 / 持有股數 / 平均成本 / 現價 / 本金 / 市值 / 未實現損益.
const COLS = 'grid-cols-[1.5fr_0.9fr_0.9fr_1.2fr_1fr_1fr_1fr]';

// 市值 desc; 無報價 (market_value null) sinks to the bottom. Shared by desktop + mobile.
function sortByValue(holdings: HoldingRow[]): HoldingRow[] {
  return [...holdings].sort((a, b) => {
    const av = a.market_value === null ? -1 : Number(a.market_value);
    const bv = b.market_value === null ? -1 : Number(b.market_value);
    return bv - av;
  });
}

function pnlColorClass(value: string | null): string {
  const sign = pnlSign(value);
  return sign === 'profit' ? 'text-profit' : sign === 'loss' ? 'text-loss' : 'text-text-muted';
}

// C-2 持股部位. 桌機 (md↑) 用表格；手機改卡片 (方案A) — 欄位太多橫滑不友善.
// 持股表只列未實現損益 (已實現見總覽卡 / 交易列本筆).
export function HoldingTable({ holdings, variant = 'full' }: HoldingTableProps) {
  const sorted = sortByValue(holdings);

  return (
    <>
      {/* 桌機：表格 */}
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[640px] text-sm" role="table" aria-label="持股部位">
          <div
            role="row"
            className={`grid ${COLS} border-b border-border px-4 py-3 text-xs font-medium text-text-muted`}
          >
            <div role="columnheader">股票</div>
            <div role="columnheader" className="text-right">持有股數</div>
            <div role="columnheader" className="text-right">平均成本</div>
            <div role="columnheader" className="text-right">現價</div>
            <div role="columnheader" className="text-right">本金</div>
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

      {/* 手機：condensed 精簡列 (社團共享) — px-5 對齊外層成員卡的表頭 */}
      {variant === 'condensed' ? (
        <div className="px-5 py-1.5 md:hidden">
          {sorted.map((h) => (
            <HoldingRowCondensed key={h.stock_symbol} h={h} />
          ))}
        </div>
      ) : (
        /* 手機：完整卡片 (個人總覽) */
        <motion.div
          className="flex flex-col gap-2.5 md:hidden"
          variants={listContainer}
          initial="hidden"
          animate="show"
        >
          {sorted.map((h) => (
            <HoldingCardFull key={h.stock_symbol} h={h} />
          ))}
        </motion.div>
      )}
    </>
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
        <div className="font-medium text-text-primary">{h.name}</div>
        <div className="text-xs text-text-secondary">{h.stock_symbol}</div>
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
        {formatMoney(h.cost_basis)}
      </div>
      <div role="cell" className="text-right tabular-nums">
        {h.market_value === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          formatMoney(h.market_value)
        )}
      </div>
      <div role="cell" className="text-right">
        {h.unrealized_pnl === null ? (
          <span className="text-text-muted">—</span>
        ) : (
          <PnLPill value={h.unrealized_pnl} />
        )}
      </div>
    </motion.div>
  );
}

// 手機完整卡片 — 標題列(名稱/代號 + 損益$/%)；主要列(損益/本金/現價/市值)、次要列(持有/均成本).
// review #3：現價（含 過時/無報價 徽章）與本金都要顯示，不可拿掉。
function HoldingCardFull({ h }: { h: HoldingRow }) {
  const noQuote = h.price === null;
  const flash = useFlashOnChange(h.price);
  const pnlColor = pnlColorClass(h.unrealized_pnl);
  const pct = unrealizedPct(h.unrealized_pnl, h.avg_cost, h.quantity);

  return (
    <motion.div
      layout
      variants={listItem}
      onAnimationEnd={flash.onAnimationEnd}
      className={`rounded-xl border border-border bg-surface p-3.5 ${flash.className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-text-primary">{h.name}</span>
          <span className="text-xs text-text-muted">{h.stock_symbol}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {h.unrealized_pnl === null ? (
            <span className="text-[15px] font-semibold text-text-muted">—</span>
          ) : (
            <>
              <span className={`text-[15px] font-semibold tabular-nums ${pnlColor}`}>
                {formatSignedMoney(h.unrealized_pnl)}
              </span>
              {pct !== null && (
                <span className={`text-xs tabular-nums ${pnlColor}`}>{formatSignedPercent(pct)}</span>
              )}
            </>
          )}
        </div>
      </div>
      {/* 主要列：本金 / 現價(含徽章) / 市值 — 損益已在標題列. */}
      <div className="mt-3 flex justify-between gap-3">
        <Stat label="本金" value={formatMoney(h.cost_basis)} />
        <Stat
          label="現價"
          value={noQuote ? '—' : formatPrice(h.price)}
          muted={noQuote}
          badge={noQuote ? '無報價' : h.stale ? '過時' : undefined}
        />
        <Stat
          label="市值"
          value={h.market_value === null ? '—' : formatMoney(h.market_value)}
          muted={h.market_value === null}
        />
      </div>
      {/* 次要列：持有 / 均成本. */}
      <div className="mt-2.5 flex gap-6 border-t border-border/60 pt-2.5">
        <Stat label="持有" value={formatLots(h.quantity)} />
        <Stat label="均成本" value={formatPrice(h.avg_cost)} />
      </div>
    </motion.div>
  );
}

// 手機精簡列 — 對應設計 M4：名稱 / 代號・市值 (+過時) ｜ 損益$.
function HoldingRowCondensed({ h }: { h: HoldingRow }) {
  const noQuote = h.price === null;
  const pnlColor = pnlColorClass(h.unrealized_pnl);
  const badge = noQuote ? '無報價' : h.stale ? '過時' : undefined;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 py-2.5 first:border-t-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">{h.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="tabular-nums">
            {h.stock_symbol} ・ {h.market_value === null ? 'N/A' : `NT$${formatMoney(h.market_value)}`}
          </span>
          {badge && <CardBadge text={badge} />}
        </span>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${pnlColor}`}>
        {h.unrealized_pnl === null ? '—' : formatSignedMoney(h.unrealized_pnl)}
      </span>
    </div>
  );
}

// 卡片內「標籤＋值」一欄，值下方可帶報價狀態徽章 (過時 / 無報價).
function Stat({
  label,
  value,
  muted,
  badge,
}: {
  label: string;
  value: string;
  muted?: boolean;
  badge?: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium tabular-nums ${muted ? 'text-text-muted' : 'text-text-primary'}`}>
        {value}
      </span>
      {badge && <CardBadge text={badge} />}
    </div>
  );
}

// 報價新鮮度徽章 (琥珀色)。桌機用 StaleBadge (含時間)，手機卡片用此精簡版.
function CardBadge({ text }: { text: string }) {
  return (
    <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-stale-soft px-1.5 py-0.5 text-[10px] font-medium text-stale">
      {text}
    </span>
  );
}
