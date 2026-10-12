'use client';

import clsx from 'clsx';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'glass-strong animate-pop pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm',
              t.tone === 'error' ? 'border-danger/40' : t.tone === 'success' ? 'border-success/40' : 'border-border',
            )}
          >
            {t.tone === 'success' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : t.tone === 'error' ? <CircleX className="mt-0.5 size-4 shrink-0 text-danger" /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
            <span className="flex-1">{t.text}</span>
            <button type="button" aria-label="Закрыть" className="text-muted hover:text-fg" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
