import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchStocks } from '../api/endpoints';
import type { StockResult } from '../api/types';
import { useDebounce } from '../hooks/useDebounce';
import { qk } from '../hooks/queries';

interface StockSymbolPickerProps {
  value: StockResult | null;
  onChange: (stock: StockResult | null) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

// C-7: autocomplete search over GET /api/stocks?q= , validates existence by selection.
export function StockSymbolPicker({ value, onChange, disabled, autoFocus }: StockSymbolPickerProps) {
  const [text, setText] = useState(value ? `${value.symbol} ${value.name}` : '');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text.trim(), 250);
  const containerRef = useRef<HTMLDivElement>(null);

  // keep text in sync when the value is set externally (e.g. edit prefill)
  useEffect(() => {
    if (value) setText(`${value.symbol} ${value.name}`);
  }, [value]);

  const enabled = open && debounced.length >= 1 && !value;
  const { data, isFetching } = useQuery({
    queryKey: qk.stocks(debounced),
    queryFn: () => searchStocks(debounced),
    enabled,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results: StockResult[] = data?.results ?? [];

  const select = (s: StockResult) => {
    onChange(s);
    setText(`${s.symbol} ${s.name}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        disabled={disabled}
        autoFocus={autoFocus}
        value={text}
        placeholder="輸入代號或名稱，如 2330 / 台積電"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(null); // editing clears selection until re-picked
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // Enter picks the top match instead of submitting the form…
          if (open && !value && results.length > 0) {
            e.preventDefault();
            select(results[0]);
          } else if (!value && text.trim().length > 0) {
            // …or swallows Enter while a symbol is half-typed/unmatched, so a
            // stray Enter never submits a transaction without a chosen stock.
            e.preventDefault();
          }
        }}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-subtle"
        autoComplete="off"
      />
      {open && debounced.length >= 1 && !value && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-card">
          {isFetching && <div className="px-3 py-2 text-sm text-text-muted">搜尋中…</div>}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-text-muted">查無此代號</div>
          )}
          {results.map((s) => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => select(s)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-subtle"
            >
              <span>
                <span className="font-medium text-text-primary">{s.symbol}</span>{' '}
                <span className="text-text-secondary">{s.name}</span>
              </span>
              <span className="text-xs text-text-muted">{s.market}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
