import { formatSignedMoney, pnlSign } from '../lib/format';

interface PnLPillProps {
  value: string | null | undefined;
  // when true, render as a coloured pill; otherwise plain coloured text
  pill?: boolean;
  className?: string;
}

// 綠漲紅跌 — international convention per BUILD-CONTRACT §6 tokens (green=profit, red=loss).
const TEXT: Record<'profit' | 'loss' | 'neutral', string> = {
  profit: 'text-profit',
  loss: 'text-loss',
  neutral: 'text-text-secondary',
};

const PILL: Record<'profit' | 'loss' | 'neutral', string> = {
  profit: 'bg-profit-soft text-profit',
  loss: 'bg-loss-soft text-loss',
  neutral: 'bg-subtle text-text-secondary',
};

export function PnLPill({ value, pill = false, className = '' }: PnLPillProps) {
  const sign = pnlSign(value);
  const text = formatSignedMoney(value);
  if (pill) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums ${PILL[sign]} ${className}`}
      >
        {text}
      </span>
    );
  }
  return <span className={`font-medium tabular-nums ${TEXT[sign]} ${className}`}>{text}</span>;
}
