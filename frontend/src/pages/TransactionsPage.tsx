import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useClub } from '../club/ClubContext';
import { useAuth } from '../auth/AuthContext';
import { useDeleteTransaction, useMembers, useTransactions } from '../hooks/queries';
import { TransactionList } from '../components/TransactionList';
import { CashList } from '../components/CashList';
import { TransactionForm } from '../components/TransactionForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows } from '../components/states';
import { ReceiptIcon, WalletIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { errorMessage } from '../lib/errors';
import { formatMoney, todayStr } from '../lib/format';
import { sortByRole } from '../lib/members';
import type { Side, TransactionRow, TransactionsQuery, TxType } from '../api/types';

// 分頁：交易（買賣）｜ 出入金（入金/出金）。同一時間只渲染一種。
type View = 'trade' | 'cash';

// P-6 交易紀錄 — 分頁〔交易 ｜ 出入金〕＋ 篩選 + 新增/編輯/刪除. C-1/C-4/C-9.
export function TransactionsPage() {
  const { clubId, canWrite } = useClub();
  const { user } = useAuth();
  const toast = useToast();

  // 分頁狀態，預設「交易」。
  const [view, setView] = useState<View>('trade');
  const [filters, setFilters] = useState<TransactionsQuery>({});
  const { data, isLoading, isError, error, refetch } = useTransactions(clubId, filters);
  const { data: membersData } = useMembers(clubId);

  const [formOpen, setFormOpen] = useState(false);
  // 新增時的起始類型（交易→BUY、出入金→DEPOSIT），決定 TransactionForm 的模式。
  const [formType, setFormType] = useState<TxType>('BUY');
  const [editTx, setEditTx] = useState<TransactionRow | null>(null);
  const [deleteTx, setDeleteTx] = useState<TransactionRow | null>(null);
  const deleteMut = useDeleteTransaction(clubId);

  // 全部 ACTIVE 交易；再依分頁分流（交易=BUY/SELL、出入金=DEPOSIT/WITHDRAW）。
  const activeTxns = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.status === 'ACTIVE'),
    [data],
  );
  const tradeTxns = useMemo(
    () => activeTxns.filter((t) => t.type === 'BUY' || t.type === 'SELL'),
    [activeTxns],
  );
  const cashTxns = useMemo(
    () => activeTxns.filter((t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAW'),
    [activeTxns],
  );

  const onConfirmDelete = async () => {
    if (!deleteTx) return;
    try {
      await deleteMut.mutateAsync(deleteTx.id);
      toast.success(deleteTx.type === 'DEPOSIT' || deleteTx.type === 'WITHDRAW' ? '出入金已刪除' : '交易已刪除');
      setDeleteTx(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleteTx(null);
    }
  };

  const members = sortByRole(membersData?.members ?? []); // 團主置頂

  // 切換分頁：清掉只屬於交易的篩選（代號/買賣別），保留成員/日期。
  const switchView = (next: View) => {
    if (next === view) return;
    setView(next);
    if (next === 'cash') {
      setFilters((f) => ({ member: f.member, from: f.from, to: f.to }));
    }
  };

  const openCreate = (type: TxType) => {
    setEditTx(null);
    setFormType(type);
    setFormOpen(true);
  };
  const openEdit = (tx: TransactionRow) => {
    setEditTx(tx);
    setFormOpen(true);
  };

  const isTrade = view === 'trade';
  // 套用在當前分頁的資料（API 已套用 filters，這裡僅作分流）。
  const rows = isTrade ? tradeTxns : cashTxns;
  // 篩選只算「會影響此分頁」的鍵：交易看全部；出入金看 成員/日期。
  const activeFilterKeys = isTrade
    ? Object.keys(filters)
    : Object.keys(filters).filter((k) => k === 'member' || k === 'from' || k === 'to');
  const hasFilter = activeFilterKeys.length > 0;
  // 選「全部成員」時，列表每筆要標出歸屬（這是誰的）；選特定成員時則不需重複。
  const showOwner = !filters.member;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-text-primary">交易紀錄</h1>
        {canWrite && (
          <Button onClick={() => openCreate(isTrade ? 'BUY' : 'DEPOSIT')}>
            {isTrade ? '＋ 新增交易' : '＋ 新增入金 / 出金'}
          </Button>
        )}
      </div>

      {/* 分頁切換：交易 ｜ 出入金 */}
      <div className="inline-flex w-full max-w-xs overflow-hidden rounded-lg border border-border bg-subtle p-1 text-sm font-medium">
        {(
          [
            { value: 'trade', label: '交易' },
            { value: 'cash', label: '出入金' },
          ] as const
        ).map((tab) => {
          const active = view === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchView(tab.value)}
              className={`flex-1 rounded-md px-3 py-1.5 transition ${
                active
                  ? 'bg-surface text-text-primary shadow-card'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filters — 去卡片：直接坐頁面背景 (§4.4)，交易分頁用完整篩選、出入金分頁較簡。 */}
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
          {isTrade && (
            <>
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
            </>
          )}
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

      {/* 手機讓卡片浮在頁面背景 (對應設計 M2)，桌機維持白卡＋表格 */}
      <section className="md:rounded-card md:border md:border-border md:bg-surface md:shadow-card">
        <div className="pb-1 md:border-b md:border-border md:px-5 md:py-3">
          <h2 className="text-sm font-bold text-text-primary">{isTrade ? '交易明細' : '出入金明細'}</h2>
        </div>
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          isTrade ? (
            <EmptyState
              icon={<ReceiptIcon />}
              title={hasFilter ? '沒有符合篩選的交易' : '還沒有任何交易'}
              description={hasFilter ? '試著調整或清除篩選條件。' : '新增你的第一筆交易。'}
              action={
                canWrite && !hasFilter ? (
                  <Button onClick={() => openCreate('BUY')}>新增第一筆交易</Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<WalletIcon />}
              title={hasFilter ? '沒有符合篩選的出入金' : '還沒有任何出入金'}
              description={hasFilter ? '試著調整或清除篩選條件。' : '新增第一筆入金 / 出金。'}
              action={
                canWrite && !hasFilter ? (
                  <Button onClick={() => openCreate('DEPOSIT')}>新增入金 / 出金</Button>
                ) : undefined
              }
            />
          )
        ) : isTrade ? (
          <TransactionList
            transactions={rows}
            currentUserId={user?.id}
            canWrite={canWrite}
            showOwner={showOwner}
            onEdit={openEdit}
            onDelete={(tx) => setDeleteTx(tx)}
          />
        ) : (
          <CashList
            transactions={rows}
            currentUserId={user?.id}
            canWrite={canWrite}
            showOwner={showOwner}
            onEdit={openEdit}
            onDelete={(tx) => setDeleteTx(tx)}
          />
        )}
      </section>

      {formOpen && (
        <TransactionForm
          open
          editTx={editTx}
          initialType={formType}
          onClose={() => {
            setFormOpen(false);
            setEditTx(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTx)}
        title={deleteTx && (deleteTx.type === 'DEPOSIT' || deleteTx.type === 'WITHDRAW') ? '刪除出入金' : '刪除交易'}
        message={deleteTx ? deleteConfirmMessage(deleteTx) : ''}
        confirmLabel="刪除"
        busy={deleteMut.isPending}
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteTx(null)}
      />
    </div>
  );
}

// 刪除確認文字：出入金(入金/出金)與買賣分開敘述.
function deleteConfirmMessage(tx: TransactionRow): string {
  if (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAW') {
    const label = tx.type === 'DEPOSIT' ? '入金' : '出金';
    return `確定要刪除這筆「${label} $${formatMoney(tx.amount)}」嗎？此操作會重算資金帳本。`;
  }
  const sideLabel = tx.side === 'BUY' ? '買進' : '賣出';
  return `確定要刪除這筆「${tx.stock_symbol} ${sideLabel} ${tx.quantity ?? 0} 股」嗎？此操作會重算部位。`;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
    </div>
  );
}
