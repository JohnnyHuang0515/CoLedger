// Display helpers. Money values arrive as string decimals; we never recompute P&L
// on the client (the backend owns the moving-average math, BUILD-CONTRACT §3).

/** Parse a string-decimal to a number for sign checks / formatting. Null-safe. */
export function toNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Format a money string as grouped TWD-style, e.g. "650000.00" -> "650,000". */
export function formatMoney(v: string | null | undefined, opts?: { decimals?: number }): string {
  const n = toNum(v);
  if (n === null) return '—';
  const decimals = opts?.decimals ?? 0;
  return n.toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Money for prices/avg cost — keeps up to 2 decimals. */
export function formatPrice(v: string | null | undefined): string {
  const n = toNum(v);
  if (n === null) return '—';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Signed P&L string with sign prefix, e.g. "+50,000" / "-1,200". */
export function formatSignedMoney(v: string | null | undefined): string {
  const n = toNum(v);
  if (n === null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;
}

/** Sign class: green profit / red loss / neutral. */
export function pnlSign(v: string | null | undefined): 'profit' | 'loss' | 'neutral' {
  const n = toNum(v);
  if (n === null || n === 0) return 'neutral';
  return n > 0 ? 'profit' : 'loss';
}

/** Quantity in shares -> "1,000 股 (1 張)" friendly form. 1 張 = 1000 股. */
export function formatShares(qty: number): string {
  const lots = qty / 1000;
  const lotLabel = Number.isInteger(lots) ? `${lots} 張` : `${lots.toFixed(3)} 張`;
  return `${qty.toLocaleString('zh-TW')} 股 (${lotLabel})`;
}

export function formatQty(qty: number): string {
  return qty.toLocaleString('zh-TW');
}

/** Format an ISO timestamp to "MM/DD HH:mm" local. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // traded_at already in YYYY-MM-DD; just return as-is
  return iso.slice(0, 10);
}

/** Today as YYYY-MM-DD for date input defaults. */
export function todayStr(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
