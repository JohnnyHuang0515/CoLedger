import { motion } from 'motion/react';
import type { TransactionRow } from '../api/types';
import { formatDate, formatMoney, formatPrice, formatQty } from '../lib/format';
import { PnLPill } from './PnLPill';
import { ProxyBadge, SidePill } from './ui';
import { fadeItem, listContainer } from '../lib/motionPresets';

interface TransactionListProps {
  transactions: TransactionRow[];
  // current user id — used to gate edit/delete to own transactions
  currentUserId: string | undefined;
  // whether the viewer can write at all (VIEWER => false)
  canWrite: boolean;
  onEdit: (tx: TransactionRow) => void;
  onDelete: (tx: TransactionRow) => void;
}

// C-4 交易歷史清單 — 日期/股票/買賣/股數/成交價/金額/本筆已實現(僅SELL)/代操badge/動作.
export function TransactionList({
  transactions,
  currentUserId,
  canWrite,
  onEdit,
  onDelete,
}: TransactionListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
            <th className="px-4 py-3">日期</th>
            <th className="px-4 py-3">股票</th>
            <th className="px-4 py-3">歸屬 / 登錄</th>
            <th className="px-4 py-3">買賣</th>
            <th className="px-4 py-3 text-right">股數</th>
            <th className="px-4 py-3 text-right">成交價</th>
            <th className="px-4 py-3 text-right">金額</th>
            <th className="px-4 py-3 text-right">本筆已實現</th>
            <th className="px-4 py-3 text-right">動作</th>
          </tr>
        </thead>
        <motion.tbody variants={listContainer} initial="hidden" animate="show">
          {transactions.map((tx) => {
            // editable when own transaction (attribution self) and can write
            const isOwn = tx.member_user_id === currentUserId;
            const editable = canWrite && isOwn;
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
                  <div className="font-medium text-text-primary">{tx.stock_symbol}</div>
                  <div className="text-xs text-text-secondary">{tx.name}</div>
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
                <td className="px-4 py-3">
                  <SidePill side={tx.side} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatQty(tx.quantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPrice(tx.price)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(tx.amount)}</td>
                <td className="px-4 py-3 text-right">
                  {tx.side === 'SELL' && tx.realized_pnl !== null ? (
                    <PnLPill value={tx.realized_pnl} />
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
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
  );
}
