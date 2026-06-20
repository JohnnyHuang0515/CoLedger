import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';
import { StockSymbolPicker } from './StockSymbolPicker';
import { useClub } from '../club/ClubContext';
import { useAuth } from '../auth/AuthContext';
import { useMembers, useCreateTransaction, useUpdateTransaction } from '../hooks/queries';
import { useToast } from './Toast';
import { errorMessage } from '../lib/errors';
import { formatMoney, todayStr } from '../lib/format';
import type {
  CreateTransactionRequest,
  Side,
  StockResult,
  TransactionRow,
} from '../api/types';

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  // when provided, the form is in EDIT mode (PATCH); otherwise CREATE (POST)
  editTx?: TransactionRow | null;
}

// Block scientific notation / sign chars that type="number" otherwise accepts
// (e.g. "1e3", "-5") — quantity and price are always positive plain numbers.
const blockInvalidNumberKeys = (e: KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
};

// C-1 交易登錄表單. Fields: 代號(C-7)、買賣、股數、成交價、日期、歸屬成員(代操)、備註.
// Live「這筆金額＝股數×成交價」. NO 手續費/證交稅 per FR + contract.
export function TransactionForm({ open, onClose, editTx }: TransactionFormProps) {
  const { clubId, isOwner } = useClub();
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = Boolean(editTx);

  const { data: membersData } = useMembers(clubId);
  const activeMembers = (membersData?.members ?? []).filter((m) => m.status === 'ACTIVE');

  const createMut = useCreateTransaction(clubId);
  const updateMut = useUpdateTransaction(clubId);

  // ---- form state ----
  const [stock, setStock] = useState<StockResult | null>(
    editTx ? { symbol: editTx.stock_symbol, name: editTx.name, market: 'TWSE' } : null,
  );
  const [side, setSide] = useState<Side>(editTx?.side ?? 'BUY');
  const [quantity, setQuantity] = useState<string>(editTx ? String(editTx.quantity) : '');
  const [qtyUnit, setQtyUnit] = useState<'shares' | 'lots'>('shares');
  const [price, setPrice] = useState<string>(editTx?.price ?? '');
  const [tradedAt, setTradedAt] = useState<string>(editTx?.traded_at ?? todayStr());
  const [memberUserId, setMemberUserId] = useState<string>(
    editTx?.member_user_id ?? user?.id ?? '',
  );
  const [isOpening, setIsOpening] = useState<boolean>(false);
  const [note, setNote] = useState<string>(editTx?.note ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const priceNum = Number(price);
  // The system always stores 股 (shares). When the unit is 張 (lots), 1 張 = 1000 股.
  const shares = useMemo(() => {
    const raw = Number(quantity);
    if (!quantity || Number.isNaN(raw) || raw <= 0) return 0;
    return qtyUnit === 'lots' ? Math.round(raw * 1000) : Math.round(raw);
  }, [quantity, qtyUnit]);
  const amount = useMemo(() => {
    if (!shares || !price || Number.isNaN(priceNum)) return null;
    return (shares * priceNum).toFixed(2);
  }, [shares, price, priceNum]);

  // Toggle 股/張 while keeping the underlying share count constant.
  const switchUnit = (u: 'shares' | 'lots') => {
    if (u === qtyUnit) return;
    if (shares > 0) setQuantity(u === 'lots' ? String(shares / 1000) : String(shares));
    setQtyUnit(u);
  };

  const submitting = createMut.isPending || updateMut.isPending;
  const isProxy = !isEdit && isOwner && memberUserId !== user?.id;

  const validate = (): string | null => {
    if (!isEdit && !stock) return '請選擇股票代號。';
    if (shares <= 0) return '數量需為正數。';
    if (qtyUnit === 'shares' && !Number.isInteger(Number(quantity)))
      return '股數需為整數（零股請用「股」輸入）。';
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) return '成交價須為正數。';
    if (!tradedAt) return '請選擇交易日期。';
    if (tradedAt > todayStr()) return '交易日期不可晚於今天。';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);

    try {
      if (isEdit && editTx) {
        await updateMut.mutateAsync({
          txId: editTx.id,
          input: {
            quantity: shares,
            price: priceNum.toFixed(2),
            traded_at: tradedAt,
            note: note || undefined,
          },
        });
        toast.success('交易已更新');
      } else {
        const payload: CreateTransactionRequest = {
          stock_symbol: stock!.symbol,
          side,
          quantity: shares,
          price: priceNum.toFixed(2),
          traded_at: tradedAt,
          is_opening_balance: isOpening || undefined,
          note: note || undefined,
        };
        // only send member_user_id when it differs from self (proxy) — OWNER only
        if (isProxy) payload.member_user_id = memberUserId;
        await createMut.mutateAsync(payload);
        toast.success(isProxy ? '已代為登錄交易' : '交易已新增');
      }
      onClose();
    } catch (mutErr) {
      // stay in modal, show field-level error (e.g. INSUFFICIENT_HOLDING / INVALID_TRANSACTION_INPUT)
      setFieldError(errorMessage(mutErr));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? '編輯交易' : '新增交易'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting} type="button">
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} type="submit">
            {submitting ? '送出中…' : isEdit ? '儲存' : '新增'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Enables Enter-to-submit (the real submit button lives in the Modal
            footer, outside this <form>). */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
        {/* 股票代號 (在編輯時鎖定，因 PATCH 不可改代號/買賣別) */}
        <Field label="股票代號">
          {isEdit ? (
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm text-text-secondary">
              {editTx?.stock_symbol} {editTx?.name}
            </div>
          ) : (
            <StockSymbolPicker value={stock} onChange={setStock} autoFocus />
          )}
        </Field>

        {/* 買賣別 */}
        <Field label="買賣別">
          {isEdit ? (
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm text-text-secondary">
              {editTx?.side === 'BUY' ? '買進' : '賣出'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['BUY', 'SELL'] as Side[]).map((s) => {
                const active = side === s;
                const isBuy = s === 'BUY';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                      active
                        ? isBuy
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-stale bg-stale text-white'
                        : 'border-border bg-surface text-text-secondary hover:bg-subtle'
                    }`}
                  >
                    {isBuy ? '買進' : '賣出'}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary">數量</label>
              <div className="flex overflow-hidden rounded-md border border-border text-xs">
                {(['shares', 'lots'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => switchUnit(u)}
                    className={`px-2 py-0.5 transition ${
                      qtyUnit === u
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface text-text-secondary hover:bg-subtle'
                    }`}
                  >
                    {u === 'shares' ? '股' : '張'}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min={qtyUnit === 'lots' ? 0.001 : 1}
              step={qtyUnit === 'lots' ? '0.001' : '1'}
              value={quantity}
              autoFocus={isEdit}
              onKeyDown={blockInvalidNumberKeys}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={qtyUnit === 'lots' ? '1' : '1000'}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="h-4 text-xs text-text-muted">
              {shares > 0
                ? qtyUnit === 'shares'
                  ? `= ${lotsText(shares)}`
                  : `= ${shares.toLocaleString('zh-TW')} 股`
                : ''}
            </p>
          </div>
          <Field label="成交價">
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onKeyDown={blockInvalidNumberKeys}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="600.00"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>

        {/* 即時金額 */}
        <div className="flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2.5">
          <span className="text-sm text-text-secondary">這筆金額（股數 × 成交價）</span>
          <span className="text-base font-bold tabular-nums text-primary">
            {amount ? `$${formatMoney(amount, { decimals: 2 })}` : '—'}
          </span>
        </div>

        <Field label="交易日期">
          <input
            type="date"
            value={tradedAt}
            max={todayStr()}
            onChange={(e) => setTradedAt(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </Field>

        {/* 歸屬成員 — 預設本人；只有 OWNER 能改成他人＝代操. Edit 模式鎖定. */}
        <Field label="歸屬成員">
          {isEdit || !isOwner ? (
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm text-text-secondary">
              {activeMembers.find((m) => m.user_id === memberUserId)?.display_name ??
                user?.display_name ??
                '本人'}
              {!isOwner && <span className="ml-2 text-xs text-text-muted">（僅團主可代操）</span>}
            </div>
          ) : (
            <select
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                  {m.user_id === user?.id ? '（本人）' : ''}
                </option>
              ))}
            </select>
          )}
          {isProxy && (
            <p className="mt-1 text-xs text-primary">將以代操方式為此成員登錄（記錄登錄者為您）。</p>
          )}
        </Field>

        {!isEdit && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={isOpening}
              onChange={(e) => setIsOpening(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            這是期初持股（補登現有部位）
          </label>
        )}

        <Field label="備註（選填）">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：跟單、加碼…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </Field>

        {fieldError && (
          <div className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{fieldError}</div>
        )}

        <p className="text-xs text-text-muted">本系統不計手續費 / 證交稅，損益僅看價差（gross）。</p>
      </form>
    </Modal>
  );
}

// "4000 股" -> "4 張", "4500" -> "4 張 + 500 股", "500" -> "500 股（零股）".
function lotsText(shares: number): string {
  const lots = Math.floor(shares / 1000);
  const odd = shares % 1000;
  if (lots > 0 && odd > 0) return `${lots.toLocaleString('zh-TW')} 張 + ${odd} 股`;
  if (lots > 0) return `${lots.toLocaleString('zh-TW')} 張`;
  return `${odd} 股（零股）`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      {children}
    </div>
  );
}
