import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { toNum } from '../lib/format';

interface CountUpMoneyProps {
  // String decimal from the API (we never recompute money on the client).
  value: string | null | undefined;
  // Prefix sign for P&L figures (e.g. "+50,000" / "-1,200").
  signed?: boolean;
  // Leading symbol, e.g. "$".
  prefix?: string;
  className?: string;
}

function format(n: number, signed: boolean): string {
  const rounded = Math.round(n);
  const grouped = Math.abs(rounded).toLocaleString('zh-TW');
  if (!signed) return rounded.toLocaleString('zh-TW');
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${grouped}`;
}

/**
 * Money figure that rolls from 0 (on mount) / its previous value (on update) to
 * the new number — the count-up animation Robinhood/Webull use on totals.
 * Honours reduced-motion (jumps straight to the value).
 */
export function CountUpMoney({ value, signed = false, prefix = '', className = '' }: CountUpMoneyProps) {
  const reduce = useReducedMotion();
  const target = toNum(value);
  // Where the last animation ended — so updates roll from the old value, not 0.
  const from = useRef(0);
  const [display, setDisplay] = useState(() =>
    target === null ? '—' : format(reduce ? target : 0, signed),
  );

  useEffect(() => {
    if (target === null) {
      setDisplay('—');
      return;
    }
    if (reduce) {
      from.current = target;
      setDisplay(format(target, signed));
      return;
    }
    const controls = animate(from.current, target, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v, signed)),
    });
    from.current = target;
    return () => controls.stop();
  }, [target, signed, reduce]);

  if (target === null) return <span className={className}>—</span>;
  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {display}
    </span>
  );
}
