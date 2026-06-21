import { motion } from 'motion/react';
import type { TransactionRow } from '../api/types';
import { formatDate, formatMoney } from '../lib/format';
import { CashTypePill, ProxyBadge } from './ui';
import { fadeItem, listContainer, listItem } from '../lib/motionPresets';

// 出入金清單 — 只渲染 DEPOSIT/WITHDRAW（入金/出金）。
// 桌機 (md↑) 表格；手機改卡片。類型膠囊 + 受益人 + 中性色金額 + 日期；自己的可編輯/刪除。
// 金額一律用中性色 text-text-primary（不紅綠）——紅綠保留給 P&L。

interface CashListProps {
  transactions: TransactionRow[];
  // current user id — used to gate edit/delete to own cash entries
  currentUserId: string | undefined;
  // whether the viewer can write at all (VIEWER => false)
  canWrite: boolean;
  // 手機卡是否顯示「受益人」標籤（檢視全部成員時 true）
  showOwner?: boolean;
  onEdit: (tx: TransactionRow) => void;
  onDelete: (tx: TransactionRow) => void;
}

// editable when own entry (attribution self) and can write
function isEditable(tx: TransactionRow, currentUserId: string | undefined, canWrite: boolean): boolean {
  return canWrite && tx.member_user_id === currentUserId;
}

export function CashList({ transactions, currentUserId, canWrite, showOwner = false, onEdit, onDelete }: CashListProps) {
  return (
    <>
      {/* 桌機：表格 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
              <th className="px-4 py-3">日期</th>
              <th className="px-4 py-3">類型</th>
              <th className="px-4 py-3">受益人 / 登錄</th>
              <th className="px-4 py-3 text-right">金額</th>
              <th className="px-4 py-3 text-right">動作</th>
            </tr>
          </thead>
          <motion.tbody variants={listContainer} initial="hidden" animate="show">
            {transactions.map((tx) => {
              const editable = isEditable(tx, currentUserId, canWrite);
              return (
                <motion.tr
                  key={tx.id}
                  variants={fadeItem}
                  className="border-b border-border/60 hover:bg-subtle/50"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatDate(tx.traded_at)}
                  </td>
                  <td className="px-4 py-3">
                    <CashTypePill type={tx.type as 'DEPOSIT' | 'WITHDRAW'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-primary">{tx.member_name}</span>
                      {tx.is_proxy && <ProxyBadge />}
                    </div>
                    {tx.is_proxy && (
                      <div className="text-xs text-text-muted">由 {tx.created_by_name} 登錄</div>
                    )}
                  </td>
                  {/* 金額：中性色（不紅綠） */}
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                    {formatMoney(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {editable ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(tx)}
                          className="text-primary hover:underline"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(tx)}
                          className="text-loss hover:underline"
                        >
                          刪除
                        </button>
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      {/* 手機：卡片 */}
      <motion.div
        className="flex flex-col gap-2.5 md:hidden"
        variants={listContainer}
        initial="hidden"
        animate="show"
      >
        {transactions.map((tx) => (
          <CashCard
            key={tx.id}
            tx={tx}
            editable={isEditable(tx, currentUserId, canWrite)}
            showOwner={showOwner}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </motion.div>
    </>
  );
}

// 手機出入金卡 — 類型膠囊 + 日期 ｜ 中性色金額 ｜ 受益人(代操時) ｜ 編輯/刪除.
function CashCard({
  tx,
  editable,
  showOwner,
  onEdit,
  onDelete,
}: {
  tx: TransactionRow;
  editable: boolean;
  showOwner: boolean;
  onEdit: (tx: TransactionRow) => void;
  onDelete: (tx: TransactionRow) => void;
}) {
  return (
    <motion.div variants={listItem} className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CashTypePill type={tx.type as 'DEPOSIT' | 'WITHDRAW'} />
          <span className="truncate font-medium text-text-primary">
            {tx.type === 'DEPOSIT' ? '入金' : '出金'}
          </span>
        </div>
        <span className="shrink-0 text-xs text-text-muted">{formatDate(tx.traded_at)}</span>
      </div>

      {/* 金額：中性色（不紅綠） */}
      <div className="mt-2.5 flex items-center justify-end gap-3 text-sm">
        <span className="font-medium tabular-nums text-text-primary">{formatMoney(tx.amount)}</span>
      </div>

      {/* 受益人：檢視全部成員時一律顯示這是誰的；代操再加「由誰登錄」 */}
      {(showOwner || tx.is_proxy) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          <span>受益人 {tx.member_name}</span>
          {tx.is_proxy && <ProxyBadge />}
          {tx.is_proxy && <span>由 {tx.created_by_name} 登錄</span>}
        </div>
      )}

      {editable && (
        <div className="mt-2.5 flex justify-end gap-5 border-t border-border/60 pt-2.5 text-sm font-medium">
          <button type="button" onClick={() => onEdit(tx)} className="py-1 -my-1 text-primary active:opacity-70">
            編輯
          </button>
          <button type="button" onClick={() => onDelete(tx)} className="py-1 -my-1 text-loss active:opacity-70">
            刪除
          </button>
        </div>
      )}
    </motion.div>
  );
}
