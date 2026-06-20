import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClub } from '../club/ClubContext';
import { useHoldings, useSummary } from '../hooks/queries';
import { PnLSummaryCard } from '../components/PnLSummaryCard';
import { HoldingTable } from '../components/HoldingTable';
import { TransactionForm } from '../components/TransactionForm';
import { Button, Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows, SkeletonSummary } from '../components/states';
import { StaleBadge } from '../components/StaleBadge';
import { WalletIcon } from '../components/icons';
import { formatTime } from '../lib/format';

// P-1 個人持股總覽 — holdings?member=me + summary.
export function DashboardPage() {
  const { clubId, canWrite } = useClub();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);

  const holdingsQ = useHoldings(clubId, 'me');
  const summaryQ = useSummary(clubId);

  const myHoldings = holdingsQ.data?.members[0]?.holdings ?? [];
  const anyStale = myHoldings.some((h) => h.stale || h.price === null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-primary">我的持股總覽</h1>
          {holdingsQ.data && (
            <p className="text-xs text-text-muted">
              資料時間 {formatTime(holdingsQ.data.as_of)}
              {anyStale && <span className="ml-2"><StaleBadge stale noData={false} /></span>}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setFormOpen(true)}>＋ 新增交易</Button>
        )}
      </div>

      {/* Summary card */}
      {summaryQ.isLoading ? (
        <Card>
          <SkeletonSummary />
        </Card>
      ) : summaryQ.isError ? (
        <Card>
          <ErrorState error={summaryQ.error} onRetry={() => summaryQ.refetch()} />
        </Card>
      ) : summaryQ.data ? (
        <PnLSummaryCard
          totalMarketValue={summaryQ.data.total_market_value}
          totalUnrealized={summaryQ.data.total_unrealized_pnl}
          totalRealized={summaryQ.data.total_realized_pnl}
        />
      ) : null}

      {/* Holdings */}
      <Card>
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold text-text-primary">持股部位</h2>
        </div>
        {holdingsQ.isLoading ? (
          <SkeletonRows />
        ) : holdingsQ.isError ? (
          <ErrorState error={holdingsQ.error} onRetry={() => holdingsQ.refetch()} />
        ) : myHoldings.length === 0 ? (
          <EmptyState
            icon={<WalletIcon />}
            title="還沒有任何持股"
            description="先補登你現有的持股部位，或新增第一筆交易。"
            action={
              canWrite ? (
                <Button onClick={() => setFormOpen(true)}>補登持股 / 新增交易</Button>
              ) : undefined
            }
          />
        ) : (
          <HoldingTable holdings={myHoldings} />
        )}
      </Card>

      <div>
        <button
          type="button"
          onClick={() => navigate(`/clubs/${clubId}/transactions`)}
          className="text-sm text-primary hover:underline"
        >
          查看完整交易紀錄 →
        </button>
      </div>

      {formOpen && <TransactionForm open onClose={() => setFormOpen(false)} />}
    </div>
  );
}
