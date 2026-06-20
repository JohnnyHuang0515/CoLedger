import { useState } from 'react';
import type { ReactNode } from 'react';
import { useClub } from '../club/ClubContext';
import { useHoldings } from '../hooks/queries';
import { HoldingTable } from '../components/HoldingTable';
import { Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows } from '../components/states';
import { UsersIcon, InboxIcon } from '../components/icons';
import { formatTime } from '../lib/format';

// P-2 共享檢視 — 全體成員持股 (holdings?member=all). 全部明細可見.
export function SharedHoldingsPage() {
  const { clubId } = useClub();
  const { data, isLoading, isError, error, refetch } = useHoldings(clubId, 'all');
  const [selected, setSelected] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Card>
          <SkeletonRows />
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

  const members = data.members;
  const visible = selected === 'all' ? members : members.filter((m) => m.user_id === selected);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary">社團共享檢視</h1>
          <p className="text-xs text-text-muted">資料時間 {formatTime(data.as_of)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={selected === 'all'} onClick={() => setSelected('all')}>
            全部成員
          </Chip>
          {members.map((m) => (
            <Chip
              key={m.user_id}
              active={selected === m.user_id}
              onClick={() => setSelected(m.user_id)}
            >
              {m.display_name}
            </Chip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersIcon />} title="沒有成員持股資料" />
        </Card>
      ) : (
        visible.map((m) => (
          <Card key={m.user_id}>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-bold text-text-primary">{m.display_name}</h2>
            </div>
            {m.holdings.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title="尚無持股" />
            ) : (
              <HoldingTable holdings={m.holdings} />
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition active:scale-95 ${
        active ? 'bg-primary text-on-primary' : 'bg-surface text-text-secondary border border-border hover:bg-subtle'
      }`}
    >
      {children}
    </button>
  );
}
