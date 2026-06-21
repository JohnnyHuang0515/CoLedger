import { useState } from 'react';
import { motion } from 'motion/react';
import { useClub } from '../club/ClubContext';
import { useActivity, useMembers } from '../hooks/queries';
import { EmptyState, ErrorState, SkeletonRows } from '../components/states';
import { ClockIcon } from '../components/icons';
import { formatTime, todayStr } from '../lib/format';
import { sortByRole } from '../lib/members';
import { listContainer, listItem } from '../lib/motionPresets';
import type { ActivityEntry, ActivityQuery, ChangeAction } from '../api/types';

const ACTION_LABEL: Record<ChangeAction, string> = {
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '刪除',
};
const ACTION_STYLE: Record<ChangeAction, string> = {
  CREATE: 'bg-profit-soft text-profit',
  UPDATE: 'bg-primary-soft text-primary',
  DELETE: 'bg-loss-soft text-loss',
};

// P-6 變更紀錄 — activity 時間軸 (C-6).
export function ActivityPage() {
  const { clubId } = useClub();
  const [filters, setFilters] = useState<ActivityQuery>({});
  const { data, isLoading, isError, error, refetch } = useActivity(clubId, filters);
  const { data: membersData } = useMembers(clubId);
  const members = sortByRole(membersData?.members ?? []); // 團主置頂

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">變更紀錄</h1>
        {data && (
          <p className="text-xs text-text-muted">共 {data.entries.length} 筆變更</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">成員</span>
            <select
              value={filters.member ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, member: e.target.value || undefined }))}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">全部</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">起</span>
            <input
              type="date"
              value={filters.from ?? ''}
              max={filters.to ?? todayStr()}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
              className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">迄</span>
            <input
              type="date"
              value={filters.to ?? ''}
              min={filters.from || undefined}
              max={todayStr()}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
              className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          {Object.keys(filters).length > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-sm text-text-secondary hover:underline"
            >
              清除篩選
            </button>
          )}
      </div>

      <section className="md:rounded-card md:border md:border-border md:bg-surface md:shadow-card">
        <div className="pb-1 md:border-b md:border-border md:px-5 md:py-3">
          <h2 className="text-sm font-bold text-text-primary">變更時間軸</h2>
        </div>
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data || data.entries.length === 0 ? (
          <EmptyState icon={<ClockIcon />} title="尚無變更紀錄" />
        ) : (
          <div className="px-5 py-4">
            <motion.ol
              className="flex flex-col gap-0"
              variants={listContainer}
              initial="hidden"
              animate="show"
            >
              {data.entries.map((entry, idx) => (
                <ActivityRow key={entry.id} entry={entry} last={idx === data.entries.length - 1} />
              ))}
            </motion.ol>
          </div>
        )}
      </section>
    </div>
  );
}

// Only these fields are surfaced in the UPDATE diff; everything else (ids,
// symbol, side…) is internal and intentionally hidden.
const FIELD_LABEL: Record<string, string> = {
  price: '成交價',
  quantity: '股數',
  traded_at: '日期',
  note: '備註',
  role: '角色',
  status: '狀態',
};

function ActivityRow({ entry, last }: { entry: ActivityEntry; last: boolean }) {
  const action = entry.action as ChangeAction;
  const changes = action === 'UPDATE' ? diffFields(entry.before, entry.after) : [];
  return (
    <motion.li variants={listItem} className="relative flex gap-3 pb-5">
      {/* timeline rail */}
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotColor(action)}`} />
        {!last && <span className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{entry.actor}</span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${ACTION_STYLE[action] ?? 'bg-subtle text-text-secondary'}`}
          >
            {ACTION_LABEL[action] ?? entry.action}
          </span>
          <span className="text-xs text-text-muted">{formatTime(entry.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">{entry.summary}</p>
        {changes.length > 0 && (
          <div className="mt-1.5 rounded-lg bg-subtle px-3 py-2">
            <dl className="flex flex-col gap-0.5">
              {changes.map((c) => (
                <div key={c.key} className="flex justify-between gap-2 text-xs">
                  <dt className="text-text-secondary">{c.label}</dt>
                  <dd className="tabular-nums text-text-primary">
                    <span className="text-text-muted line-through">{c.before}</span>
                    <span className="px-1 text-text-muted">→</span>
                    <span>{c.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </motion.li>
  );
}

function dotColor(action: ChangeAction): string {
  if (action === 'CREATE') return 'bg-profit';
  if (action === 'DELETE') return 'bg-loss';
  return 'bg-primary';
}

interface FieldChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldChange[] {
  const b = before ?? {};
  const a = after ?? {};
  const out: FieldChange[] = [];
  for (const [key, label] of Object.entries(FIELD_LABEL)) {
    if (!(key in a) && !(key in b)) continue;
    const bv = fmtValue(b[key]);
    const av = fmtValue(a[key]);
    if (bv !== av) out.push({ key, label, before: bv, after: av });
  }
  return out;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
