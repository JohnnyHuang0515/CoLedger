import { formatTime } from '../lib/format';

interface StaleBadgeProps {
  // C-8: report price freshness.
  stale: boolean;
  priceAsOf?: string | null;
  // true when there's no quote at all (price === null)
  noData?: boolean;
}

/**
 * C-8 報價過時標示。fresh -> hidden; stale -> amber「過時」; no-data -> amber「無報價」.
 */
export function StaleBadge({ stale, priceAsOf, noData }: StaleBadgeProps) {
  if (noData) {
    return (
      <span className="inline-flex items-center rounded-full bg-stale-soft px-2 py-0.5 text-xs font-medium text-stale">
        無報價
      </span>
    );
  }
  if (!stale) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-stale-soft px-2 py-0.5 text-xs font-medium text-stale"
      title={priceAsOf ? `資料時間 ${formatTime(priceAsOf)}` : undefined}
    >
      <span aria-hidden>⏱</span>
      {priceAsOf ? `${formatTime(priceAsOf)} 過時` : '報價過時'}
    </span>
  );
}
