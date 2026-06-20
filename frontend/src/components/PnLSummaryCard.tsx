import { motion } from 'motion/react';
import { pnlSign } from '../lib/format';
import { Card } from './ui';
import { CountUpMoney } from './CountUpMoney';
import { fadeUp } from '../lib/motionPresets';

interface StatProps {
  label: string;
  // money string
  value: string | null;
  // when true, render with profit/loss color (signed)
  signed?: boolean;
  hint?: string;
}

function Stat({ label, value, signed, hint }: StatProps) {
  const sign = signed ? pnlSign(value) : 'neutral';
  const valueColor =
    sign === 'profit' ? 'text-profit' : sign === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        <CountUpMoney value={value} signed={signed} prefix={signed ? '' : '$'} />
      </span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

interface PnLSummaryCardProps {
  totalMarketValue: string | null;
  totalUnrealized: string | null;
  totalRealized: string | null;
  // optional 4th card content (e.g. 熱門持股 for P-4)
  extra?: { label: string; value: string; hint?: string };
}

// C-3 損益總覽卡 — 總市值 / 總未實現 / 總已實現 (+ 可選熱門持股).
export function PnLSummaryCard({
  totalMarketValue,
  totalUnrealized,
  totalRealized,
  extra,
}: PnLSummaryCardProps) {
  const gridCols = extra
    ? 'sm:grid-cols-2 lg:grid-cols-4'
    : 'sm:grid-cols-3';
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <div
          className={`grid grid-cols-1 divide-y divide-border sm:divide-x sm:divide-y-0 ${gridCols}`}
        >
          <Stat label="總市值" value={totalMarketValue} />
          <Stat label="總未實現損益" value={totalUnrealized} signed />
          <Stat label="總已實現損益" value={totalRealized} signed />
          {extra && (
            <div className="flex flex-col gap-1 px-5 py-4">
              <span className="text-xs font-medium text-text-secondary">{extra.label}</span>
              <span className="text-2xl font-bold text-text-primary">{extra.value}</span>
              {extra.hint && <span className="text-xs text-text-muted">{extra.hint}</span>}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
