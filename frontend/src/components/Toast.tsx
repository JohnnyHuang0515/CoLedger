import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

// Colored circular icon badge per kind (white glyph on a solid colour).
const BADGE_BG: Record<ToastKind, string> = {
  success: 'bg-profit',
  error: 'bg-loss',
  info: 'bg-primary',
};
const BADGE_GLYPH: Record<ToastKind, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => remove(id), 3800);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* bottom-right; full-width on mobile */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              role="status"
              initial={{ opacity: 0, x: 28, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-sm text-text-primary shadow-[0_8px_24px_-8px_rgba(21,32,43,0.18)]"
            >
              <span
                className={`mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold text-on-primary ${BADGE_BG[t.kind]}`}
                aria-hidden
              >
                {BADGE_GLYPH[t.kind]}
              </span>
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="ml-auto flex-none text-text-muted opacity-60 hover:opacity-100"
                aria-label="關閉"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
