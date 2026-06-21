import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { HoldingRow } from '../api/types';
import { toNum } from '../lib/format';

// 賺賠甜甜圈 — 中空雙段環，綠=獲利、紅=虧損。P&L 一律用後端值，前端不重算：
// 依每檔 unrealized_pnl 正負分桶，環的兩段大小用各桶的 market_value 合計（純顯示分組）。

export interface DonutSlices {
  // Σ market_value of holdings with unrealized_pnl > 0
  gainValue: number;
  // Σ market_value of holdings with unrealized_pnl < 0
  lossValue: number;
}

// 由一組持股算出獲利桶 / 虧損桶的市值合計（無報價 / market_value 為 null 的略過）。
export function slicesFromHoldings(holdings: HoldingRow[]): DonutSlices {
  let gainValue = 0;
  let lossValue = 0;
  for (const h of holdings) {
    const pnl = toNum(h.unrealized_pnl);
    const mv = toNum(h.market_value);
    if (pnl === null || mv === null) continue;
    if (pnl > 0) gainValue += mv;
    else if (pnl < 0) lossValue += mv;
  }
  return { gainValue, lossValue };
}

interface DonutChartProps {
  // 直接傳算好的兩桶值，或傳 holdings 讓元件自己算。
  slices?: DonutSlices;
  holdings?: HoldingRow[];
  // 直徑 (px)。
  size?: number;
  // 環寬 (px)。
  thickness?: number;
  // 中心內容（例如報酬率）。
  center?: ReactNode;
  // 是否顯示底部圖例（獲利持股 X% / 虧損持股 Y%）。
  legend?: boolean;
  className?: string;
}

const PROFIT = '#15A35A'; // profit.DEFAULT
const LOSS = '#DC2F3C'; // loss.DEFAULT
const TRACK = '#F0F2F6'; // subtle — 全部無損益 / 無資料時的底環

// SVG 環段：以 circle + stroke-dasharray 畫弧。pathLength=100 讓 dash 直接吃百分比。
function Arc({
  color,
  percent,
  offset,
  radius,
  thickness,
  animate,
}: {
  color: string;
  percent: number;
  offset: number;
  radius: number;
  thickness: number;
  animate: boolean;
}) {
  if (percent <= 0) return null;
  // 留 1.2% 間隙讓兩段不黏在一起（單段佔滿時不留縫）。
  const gap = percent >= 100 ? 0 : 1.2;
  const dash = Math.max(percent - gap, 0);
  return (
    <motion.circle
      cx="50"
      cy="50"
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray={`${dash} ${100 - dash}`}
      strokeDashoffset={-offset}
      initial={animate ? { strokeDasharray: `0 100` } : false}
      animate={{ strokeDasharray: `${dash} ${100 - dash}` }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/**
 * 中空甜甜圈，顯示「獲利 vs 虧損」兩段。
 * - 綠段 = 獲利持股市值佔比、紅段 = 虧損持股市值佔比。
 * - 中心 (center) 可放報酬率等內容；size / thickness 可調。
 * - 兩桶皆為 0（無持股 / 全部無損益）時畫一圈灰色底環。
 */
export function DonutChart({
  slices,
  holdings,
  size = 132,
  thickness = 14,
  center,
  legend = true,
  className = '',
}: DonutChartProps) {
  const reduce = useReducedMotion();
  const resolved: DonutSlices = slices ?? slicesFromHoldings(holdings ?? []);
  const { gainValue, lossValue } = resolved;
  const total = gainValue + lossValue;

  const gainPct = total > 0 ? (gainValue / total) * 100 : 0;
  const lossPct = total > 0 ? (lossValue / total) * 100 : 0;

  // viewBox 100x100；半徑扣半個環寬，stroke 才不會被裁掉。畫布 scale 由 SVG width/height 決定。
  const r = 50 - thickness / 2;

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          // 從 12 點鐘起順時針：先逆時針旋 90°，再翻轉 X 把方向轉成順時針。
          style={{ transform: 'rotate(-90deg) scaleX(-1)' }}
          aria-hidden
        >
          {total <= 0 ? (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={TRACK}
              strokeWidth={thickness}
            />
          ) : (
            <>
              <Arc
                color={PROFIT}
                percent={gainPct}
                offset={0}
                radius={r}
                thickness={thickness}
                animate={!reduce}
              />
              <Arc
                color={LOSS}
                percent={lossPct}
                offset={gainPct}
                radius={r}
                thickness={thickness}
                animate={!reduce}
              />
            </>
          )}
        </svg>
        {center !== undefined && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {center}
          </div>
        )}
      </div>

      {legend && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <LegendDot color={PROFIT} label="獲利持股" pct={gainPct} />
          <LegendDot color={LOSS} label="虧損持股" pct={lossPct} />
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums text-text-secondary">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label} {Math.round(pct)}%
    </span>
  );
}
