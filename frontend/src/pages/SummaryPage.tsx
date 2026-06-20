import { motion } from 'motion/react';
import { useClub } from '../club/ClubContext';
import { useSummary } from '../hooks/queries';
import { PnLSummaryCard } from '../components/PnLSummaryCard';
import { PnLPill } from '../components/PnLPill';
import { Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows, SkeletonSummary } from '../components/states';
import { CalculatorIcon } from '../components/icons';
import { formatMoney, formatQty, formatTime, toNum } from '../lib/format';
import { fadeItem, listContainer } from '../lib/motionPresets';

// P-4 社團彙總 — summary: 4 卡 (總市值/總未實現/總已實現/熱門持股) + by_symbol 各檔合計表.
export function SummaryPage() {
  const { clubId } = useClub();
  const { data, isLoading, isError, error, refetch } = useSummary(clubId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Card>
          <SkeletonSummary />
        </Card>
        <Card>
          <SkeletonRows />
        </Card>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => refetch()} />
      </Card>
    );
  }

  // 熱門持股 = top by total market value
  const top = [...data.by_symbol].sort(
    (a, b) => Number(b.total_market_value) - Number(a.total_market_value),
  )[0];

  // Largest market value — used to scale the per-row allocation bars.
  const maxMarketValue = data.by_symbol.reduce(
    (max, s) => Math.max(max, toNum(s.total_market_value) ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">社團彙總</h1>
        <p className="text-xs text-text-muted">資料時間 {formatTime(data.as_of)}（只計有效成員）</p>
      </div>

      <PnLSummaryCard
        totalMarketValue={data.total_market_value}
        totalUnrealized={data.total_unrealized_pnl}
        totalRealized={data.total_realized_pnl}
        extra={
          top
            ? {
                label: '熱門持股',
                value: `${top.stock_symbol}`,
                hint: `${top.name}・市值 $${formatMoney(top.total_market_value)}`,
              }
            : { label: '熱門持股', value: '—' }
        }
      />

      <Card>
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold text-text-primary">各檔合計</h2>
        </div>
        {data.by_symbol.length === 0 ? (
          <EmptyState icon={<CalculatorIcon />} title="尚無持股合計" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
                  <th className="px-4 py-3">股票</th>
                  <th className="px-4 py-3 text-right">合計股數</th>
                  <th className="px-4 py-3 text-right">合計市值</th>
                  <th className="px-4 py-3 text-right">合計未實現損益</th>
                </tr>
              </thead>
              <motion.tbody variants={listContainer} initial="hidden" animate="show">
                {data.by_symbol.map((s) => {
                  const mv = toNum(s.total_market_value) ?? 0;
                  const pct = maxMarketValue > 0 ? (mv / maxMarketValue) * 100 : 0;
                  return (
                    <motion.tr
                      key={s.stock_symbol}
                      variants={fadeItem}
                      className="border-b border-border/60 hover:bg-subtle/50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{s.stock_symbol}</div>
                        <div className="text-xs text-text-secondary">{s.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatQty(s.total_quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div>{formatMoney(s.total_market_value)}</div>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-subtle">
                          <motion.div
                            className="h-full rounded-full bg-primary/60"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PnLPill value={s.total_unrealized_pnl} />
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
