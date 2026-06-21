import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClub } from '../club/ClubContext';
import { useHoldings } from '../hooks/queries';
import { PnLDonutCard } from '../components/PnLDonutCard';
import { HoldingTable } from '../components/HoldingTable';
import { TransactionForm } from '../components/TransactionForm';
import { Button, Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows, SkeletonSummary } from '../components/states';
import { StaleBadge } from '../components/StaleBadge';
import { WalletIcon } from '../components/icons';
import { formatTime } from '../lib/format';
import type { TxType } from '../api/types';

// P-1 我的資金帳本 — holdings?member=me（含 member.ledger）+ 持股部位.
export function DashboardPage() {
  const { clubId, canWrite } = useClub();
  const navigate = useNavigate();
  // formMode: null=closed, 'tx'=新增交易, 'cash'=入金/出金
  const [formMode, setFormMode] = useState<null | TxType>(null);

  const holdingsQ = useHoldings(clubId, 'me');

  const me = holdingsQ.data?.members[0];
  const myHoldings = me?.holdings ?? [];
  const ledger = me?.ledger ?? null;
  const anyStale = myHoldings.some((h) => h.stale || h.price === null);

  const actions = canWrite ? (
    <>
      <Button variant="secondary" onClick={() => setFormMode('DEPOSIT')}>
        ＋ 入金 / 出金
      </Button>
      <Button onClick={() => setFormMode('BUY')}>＋ 新增交易</Button>
    </>
  ) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">資金帳本</h1>
          {holdingsQ.data && (
            <p className="text-xs text-text-muted">
              資料時間 {formatTime(holdingsQ.data.as_of)}
              {anyStale && <span className="ml-2"><StaleBadge stale noData={false} /></span>}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* 賺賠甜甜圈卡 — 甜甜圈(獲利/虧損)+報酬率 ＋ 總資產/總損益 ＋ 淨入金/已實現 */}
      {holdingsQ.isLoading ? (
        <Card>
          <SkeletonSummary />
        </Card>
      ) : holdingsQ.isError ? (
        <Card>
          <ErrorState error={holdingsQ.error} onRetry={() => holdingsQ.refetch()} />
        </Card>
      ) : ledger ? (
        <PnLDonutCard ledger={ledger} holdings={myHoldings} title="總資產" />
      ) : null}

      {/* Holdings — 手機讓持股卡浮在頁面背景，桌機維持白卡＋表格 */}
      <section className="md:rounded-card md:border md:border-border md:bg-surface md:shadow-card">
        <div className="pb-1 md:border-b md:border-border md:px-5 md:py-3">
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
                <Button onClick={() => setFormMode('BUY')}>補登持股 / 新增交易</Button>
              ) : undefined
            }
          />
        ) : (
          <HoldingTable holdings={myHoldings} />
        )}
      </section>

      <div>
        <button
          type="button"
          onClick={() => navigate(`/clubs/${clubId}/transactions`)}
          className="text-sm text-primary hover:underline"
        >
          查看完整交易紀錄 →
        </button>
      </div>

      {formMode && (
        <TransactionForm open initialType={formMode} onClose={() => setFormMode(null)} />
      )}
    </div>
  );
}
