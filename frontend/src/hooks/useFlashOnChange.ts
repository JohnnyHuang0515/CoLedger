import { useEffect, useRef, useState } from 'react';
import { toNum } from '../lib/format';

interface Flash {
  // Tailwind animation class to apply ('' when idle).
  className: string;
  // Wire to the element's onAnimationEnd to clear the flash after it plays.
  onAnimationEnd: () => void;
}

/**
 * Flashes a row/cell green on a value increase, red on a decrease — the "tick
 * flash" stock apps use when a quote updates. Compares the incoming string
 * decimal against the previous render; first render never flashes.
 *
 * The CSS animations (`animate-flash-profit/-loss`) end at `transparent`, so the
 * element's resting background (hover etc.) returns once `onAnimationEnd` clears.
 */
export function useFlashOnChange(value: string | null | undefined): Flash {
  const prev = useRef<number | null>(toNum(value));
  const [className, setClassName] = useState('');

  useEffect(() => {
    const next = toNum(value);
    const before = prev.current;
    if (next !== null && before !== null && next !== before) {
      setClassName(next > before ? 'animate-flash-profit' : 'animate-flash-loss');
    }
    prev.current = next;
  }, [value]);

  return { className, onAnimationEnd: () => setClassName('') };
}
