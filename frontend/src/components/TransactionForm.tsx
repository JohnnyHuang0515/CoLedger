import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';
import { StockSymbolPicker } from './StockSymbolPicker';
import { useClub } from '../club/ClubContext';
import { useAuth } from '../auth/AuthContext';
import {
  useMembers,
  useCreateCashTransaction,
  useCreateTransaction,
  useUpdateTransaction,
} from '../hooks/queries';
import { useToast } from './Toast';
import { errorMessage } from '../lib/errors';
import { formatMoney, todayStr } from '../lib/format';
import type {
  CreateCashTransactionRequest,
  CreateTransactionRequest,
  Side,
  StockResult,
  TransactionRow,
  TxType,
} from '../api/types';

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  // when provided, the form is in EDIT mode (PATCH); otherwise CREATE (POST)
  editTx?: TransactionRow | null;
  // 決定表單模式：BUY/SELL → 交易模式；DEPOSIT/WITHDRAW → 出入金模式。
  // DashboardPage 與 TransactionsPage 都靠它呼叫對應的表單。預設 BUY（交易）。
  initialType?: TxType;
}

// 交易模式分段（買 / 賣）。
const TRADE_TABS: { value: Extract<TxType, 'BUY' | 'SELL'>; label: string }[] = [
  { value: 'BUY', label: '買進' },
  { value: 'SELL', label: '賣出' },
];

// 出入金模式分段（入金 / 出金）。
const CASH_TABS: { value: Extract<TxType, 'DEPOSIT' | 'WITHDRAW'>; label: string }[] = [
  { value: 'DEPOSIT', label: '入金' },
  { value: 'WITHDRAW', label: '出金' },
];

// 是否為現金（出入金）類型。
function isCashType(t: TxType): boolean {
  return t === 'DEPOSIT' || t === 'WITHDRAW';
}

const TYPE_LABEL: Record<TxType, string> = {
  BUY: '買進',
  SELL: '賣出',
  DEPOSIT: '入金',
  WITHDRAW: '出金',
};

// Block scientific notation / sign chars that type="number" otherwise accepts
// (e.g. "1e3", "-5") — quantity and price are always positive plain numbers.
const blockInvalidNumberKeys = (e: KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
};

// C-1 交易 / 出入金登錄表單. 依 initialType（或 editTx.type）拆兩模式：
//  - 交易模式（BUY/SELL）：代號(C-7)、買/賣、股數、成交價、日期、歸屬成員(代操)、備註，Live 金額.
//  - 出入金模式（DEPOSIT/WITHDRAW）：入金/出金、單一金額、日期、受益成員、備註（無股票欄位）.
// NO 手續費/證交稅 per FR + contract.
export function TransactionForm({ open, onClose, editTx, initialType }: TransactionFormProps) {
  const { clubId, isOwner } = useClub();
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = Boolean(editTx);

  const { data: membersData } = useMembers(clubId);
  const activeMembers = (membersData?.members ?? []).filter((m) => m.status === 'ACTIVE');

  const createMut = useCreateTransaction(clubId);
  const createCashMut = useCreateCashTransaction(clubId);
  const updateMut = useUpdateTransaction(clubId);

  // 表單模式由 initialType（或編輯沿用 editTx.type）決定，使用者不可跨模式切換：
  //   交易模式只在 買/賣 之間切；出入金模式只在 入金/出金 之間切。
  const [txType, setTxType] = useState<TxType>(editTx?.type ?? initialType ?? 'BUY');
  const isCash = isCashType(txType);

  // ---- form state ----
  const [stock, setStock] = useState<StockResult | null>(
    editTx && editTx.stock_symbol
      ? { symbol: editTx.stock_symbol, name: editTx.name ?? '', market: 'TWSE' }
      : null,
  );
  // 現金交易金額（DEPOSIT/WITHDRAW 用），股票交易用 quantity×price 算金額.
  const [cashAmount, setCashAmount] = useState<string>(editTx?.amount ?? '');
  const [quantity, setQuantity] = useState<string>(editTx?.quantity ? String(editTx.quantity) : '');
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
  const cashAmountNum = Number(cashAmount);
  // 股票交易的買賣別由 txType 推導（BUY/SELL）。
  const side: Side = txType === 'SELL' ? 'SELL' : 'BUY';
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

  const submitting = createMut.isPending || createCashMut.isPending || updateMut.isPending;
  const isProxy = !isEdit && isOwner && memberUserId !== user?.id;

  const validate = (): string | null => {
    if (isCash) {
      if (!cashAmount || Number.isNaN(cashAmountNum) || cashAmountNum <= 0) return '金額須為正數。';
      if (!tradedAt) return '請選擇日期。';
      if (tradedAt > todayStr()) return '日期不可晚於今天。';
      return null;
    }
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
      } else if (isCash) {
        const payload: CreateCashTransactionRequest = {
          type: txType as 'DEPOSIT' | 'WITHDRAW',
          amount: cashAmountNum.toFixed(2),
          traded_at: tradedAt,
          note: note || undefined,
        };
        if (isProxy) payload.member_user_id = memberUserId;
        await createCashMut.mutateAsync(payload);
        const label = txType === 'DEPOSIT' ? '入金' : '出金';
        toast.success(isProxy ? `已代為登錄${label}` : `${label}已新增`);
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
      title={
        isEdit
          ? isCash
            ? '編輯出入金'
            : '編輯交易'
          : isCash
            ? '新增入金 / 出金'
            : '新增交易'
      }
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

        {/* 分段切換：交易模式 = 買/賣；出入金模式 = 入金/出金（編輯時鎖定，PATCH 不可改類型）。
            兩模式互不交叉——表單由 initialType 決定屬於哪一個模式。 */}
        <Field label={isCash ? '類型' : '買賣別'}>
          {isEdit ? (
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm text-text-secondary">
              {TYPE_LABEL[txType]}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(isCash ? CASH_TABS : TRADE_TABS).map((t) => {
                const active = txType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTxType(t.value)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition active:scale-[0.98] ${
                      active
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-border bg-surface text-text-secondary hover:bg-subtle'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        {/* 股票代號 — 僅股票交易；編輯時鎖定 */}
        {!isCash && (
          <Field label="股票代號">
            {isEdit ? (
              <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm text-text-secondary">
                {editTx?.stock_symbol} {editTx?.name}
              </div>
            ) : (
              <StockSymbolPicker value={stock} onChange={setStock} autoFocus />
            )}
          </Field>
        )}

        {/* 現金交易：只需金額 */}
        {isCash && (
          <Field label="金額">
            <input
              type="number"
              min={0}
              step="0.01"
              value={cashAmount}
              autoFocus
              onKeyDown={blockInvalidNumberKeys}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder="100000.00"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
        )}

        {!isCash && (
        <>
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
                    className={`px-2.5 py-1 transition ${
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
        </>
        )}

        <Field label={isCash ? '日期' : '交易日期'}>
          <input
            type="date"
            value={tradedAt}
            max={todayStr()}
            onChange={(e) => setTradedAt(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </Field>

        {/* 歸屬成員（受益人）— 預設本人；只有 OWNER 能改成他人＝代操. Edit 模式鎖定. */}
        <Field label={isCash ? '受益成員' : '歸屬成員'}>
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

        {!isEdit && !isCash && (
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

        {!isCash && (
          <p className="text-xs text-text-muted">本系統不計手續費 / 證交稅，損益僅看價差（gross）。</p>
        )}
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
