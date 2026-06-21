import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Role, MembershipStatus, Side, TxType } from '../api/types';

// ---- Button ----
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 disabled:opacity-50',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-subtle disabled:opacity-50',
  ghost: 'text-primary hover:bg-primary-soft disabled:opacity-50',
  danger: 'bg-loss text-on-primary hover:opacity-90 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---- Card ----
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

// ---- Role pill ----
const ROLE_LABEL: Record<Role, string> = {
  OWNER: '團主',
  MEMBER: '成員',
  VIEWER: '唯讀',
};
const ROLE_STYLE: Record<Role, string> = {
  OWNER: 'bg-primary-soft text-primary',
  MEMBER: 'bg-subtle text-text-secondary',
  VIEWER: 'bg-stale-soft text-stale',
};
export function RolePill({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLE[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

// ---- Status pill ----
const STATUS_LABEL: Record<MembershipStatus, string> = {
  INVITED: '已邀請',
  ACTIVE: '已加入',
  REMOVED: '已移除',
};
const STATUS_STYLE: Record<MembershipStatus, string> = {
  INVITED: 'bg-stale-soft text-stale',
  ACTIVE: 'bg-profit-soft text-profit',
  REMOVED: 'bg-subtle text-text-muted',
};
export function StatusPill({ status }: { status: MembershipStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---- Side pill (BUY/SELL) ----
// Neutral palette (買=藍 / 賣=琥珀) so green/red stay reserved for P&L only.
export function SidePill({ side }: { side: Side }) {
  const isBuy = side === 'BUY';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
        isBuy ? 'bg-primary-soft text-primary' : 'bg-stale-soft text-stale'
      }`}
    >
      {isBuy ? '買' : '賣'}
    </span>
  );
}

// ---- Cash type pill (入金/出金) ----
// 入金=primary（藍底）、出金=中性（灰底）。金額本身用中性色，不用紅綠。
export function CashTypePill({ type }: { type: Extract<TxType, 'DEPOSIT' | 'WITHDRAW'> }) {
  const isDeposit = type === 'DEPOSIT';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
        isDeposit ? 'bg-primary-soft text-primary' : 'bg-subtle text-text-secondary'
      }`}
    >
      {isDeposit ? '入金' : '出金'}
    </span>
  );
}

// ---- Proxy (代操) badge ----
export function ProxyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
      代操
    </span>
  );
}
