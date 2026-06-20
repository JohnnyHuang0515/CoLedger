import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useClub } from '../club/ClubContext';
import { useAuth } from '../auth/AuthContext';
import { useDeleteTransaction, useMembers, useTransactions } from '../hooks/queries';
import { TransactionList } from '../components/TransactionList';
import { TransactionForm } from '../components/TransactionForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows } from '../components/states';
import { ReceiptIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { errorMessage } from '../lib/errors';
import { todayStr } from '../lib/format';
import type { Side, TransactionRow, TransactionsQuery } from '../api/types';

// P-6 交易紀錄 — TransactionList + 篩選 + 新增/編輯/刪除. C-1/C-4/C-9.
export function TransactionsPage() {
  const { clubId, canWrite } = useClub();
  const { user } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState<TransactionsQuery>({});
  const { data, isLoading, isError, error, refetch } = useTransactions(clubId, filters);
  const { data: membersData } = useMembers(clubId);

  const [formOpen, setFormOpen] = useState(false);
  const [editTx, setEditTx] = useState<TransactionRow | null>(null);
  const [deleteTx, setDeleteTx] = useState<TransactionRow | null>(null);
  const deleteMut = useDeleteTransaction(clubId);

  const activeTxns = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.status === 'ACTIVE'),
    [data],
  );

  const onConfirmDelete = async () => {
    if (!deleteTx) return;
    try {
      await deleteMut.mutateAsync(deleteTx.id);
      toast.success('交易已刪除');
      setDeleteTx(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleteTx(null);
    }
  };

  const members = membersData?.members ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-text-primary">交易紀錄</h1>
        {canWrite && (
          <Button
            onClick={() => {
              setEditTx(null);
              setFormOpen(true);
            }}
          >
            ＋ 新增交易
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="成員">
            <select
              value={filters.member ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, member: e.target.value || undefined }))}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">全部成員</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="代號">
            <input
              value={filters.symbol ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, symbol: e.target.value || undefined }))}
              placeholder="如 2330"
              className="w-28 rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </FilterField>
          <FilterField label="買賣別">
            <select
              value={filters.side ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, side: (e.target.value || undefined) as Side | undefined }))
              }
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">全部</option>
              <option value="BUY">買進</option>
              <option value="SELL">賣出</option>
            </select>
          </FilterField>
          <FilterField label="起">
            <input
              type="date"
              value={filters.from ?? ''}
              max={filters.to ?? todayStr()}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
              className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </FilterField>
          <FilterField label="迄">
            <input
              type="date"
              value={filters.to ?? ''}
              min={filters.from || undefined}
              max={todayStr()}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
              className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </FilterField>
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
      </Card>

      <Card>
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : activeTxns.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title={Object.keys(filters).length > 0 ? '沒有符合篩選的交易' : '還沒有任何交易'}
            description={
              Object.keys(filters).length > 0 ? '試著調整或清除篩選條件。' : '新增你的第一筆交易。'
            }
            action={
              canWrite && Object.keys(filters).length === 0 ? (
                <Button
                  onClick={() => {
                    setEditTx(null);
                    setFormOpen(true);
                  }}
                >
                  新增第一筆交易
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TransactionList
            transactions={activeTxns}
            currentUserId={user?.id}
            canWrite={canWrite}
            onEdit={(tx) => {
              setEditTx(tx);
              setFormOpen(true);
            }}
            onDelete={(tx) => setDeleteTx(tx)}
          />
        )}
      </Card>

      {formOpen && (
        <TransactionForm
          open
          editTx={editTx}
          onClose={() => {
            setFormOpen(false);
            setEditTx(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTx)}
        title="刪除交易"
        message={
          deleteTx
            ? `確定要刪除這筆「${deleteTx.stock_symbol} ${deleteTx.side === 'BUY' ? '買進' : '賣出'} ${deleteTx.quantity} 股」嗎？此操作會重算部位。`
            : ''
        }
        confirmLabel="刪除"
        busy={deleteMut.isPending}
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteTx(null)}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
    </div>
  );
}
