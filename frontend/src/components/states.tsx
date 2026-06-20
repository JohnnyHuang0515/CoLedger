import type { ReactNode } from 'react';
import { errorMessage } from '../lib/errors';
import { InboxIcon } from './icons';

// Shared state components used with react-query loading/error states.

export function LoadingState({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-secondary">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-loss-soft text-xl text-loss">
        !
      </div>
      <p className="text-sm text-text-secondary">{errorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90"
        >
          重試
        </button>
      )}
    </div>
  );
}

// ---- Skeletons (shimmer placeholders shown while data loads) ----

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Placeholder rows matching the holding/transaction tables, used inside a Card. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-5" aria-busy aria-label="載入中">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for the 3-stat 損益總覽卡, used inside a Card. */
export function SkeletonSummary() {
  return (
    <div
      className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      aria-busy
      aria-label="載入中"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = <InboxIcon />,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-4xl text-text-muted" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-medium text-text-primary">{title}</h3>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
