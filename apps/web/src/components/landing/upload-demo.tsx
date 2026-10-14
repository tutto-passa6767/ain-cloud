'use client';

import clsx from 'clsx';
import { CircleCheck, Film, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { formatBytes } from '@/lib/format';

// Реальные параметры загрузчика: части по 64 МБ, четыре потока (настройки upload.partSizeMb / parallelParts)
const CELLS = 96;
const PARTS = 768;
const PER_CELL = PARTS / CELLS;
const TOTAL = 48 * 1024 ** 3;
const THREADS = 4;

/** Симуляция загрузки частями: клетка — 8 частей по 64 МБ, связь можно оборвать и вернуть */
export function UploadDemo() {
  const { t, locale } = useI18n();
  // Стартуем не с нуля — блок сразу выглядит «живым»
  const [done, setDone] = useState(28);
  const [offline, setOffline] = useState(false);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const finished = done >= CELLS;

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || offline) return;
    if (finished) {
      const id = setTimeout(() => setDone(0), 3200);
      return () => clearTimeout(id);
    }
    const id = setInterval(() => setDone((d) => Math.min(CELLS, d + 1)), 130);
    return () => clearInterval(id);
  }, [visible, offline, finished]);

  const part = Math.min(PARTS, done * PER_CELL);
  const sent = formatBytes((done / CELLS) * TOTAL, locale);
  const status = finished
    ? t('landing.simDone')
    : offline
      ? t('landing.simOffline', { part })
      : t('landing.simProgress', { sent, total: formatBytes(TOTAL, locale), part: Math.max(1, part), parts: PARTS });

  return (
    <div ref={box} className="card-noir rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl border border-border bg-accent-soft text-accent">
          <Film className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{t('landing.simFile')}</p>
          <p className="font-mono text-[11px] text-subtle">
            {formatBytes(TOTAL, locale)} · {PARTS} × {formatBytes(64 * 1024 ** 2, locale)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOffline((o) => !o)}
          disabled={finished}
          className={clsx(
            'inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-40 sm:w-auto',
            offline ? 'border-transparent btn-primary' : 'border-border-strong hover:bg-surface-2',
          )}
        >
          {offline ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          {offline ? t('landing.simRestore') : t('landing.simDrop')}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-12 gap-1.5 sm:grid-cols-16" aria-hidden>
        {Array.from({ length: CELLS }, (_, i) => {
          const isDone = i < done;
          const inFlight = !finished && i >= done && i < done + THREADS;
          return (
            <span
              key={i}
              className={clsx(
                'aspect-square rounded-[5px] transition-colors duration-300',
                isDone && 'bg-gradient-to-br from-ember to-accent-solid',
                inFlight && !offline && 'animate-pulse border border-accent bg-accent-soft',
                inFlight && offline && 'border border-dashed border-warning bg-warning-soft',
                !isDone && !inFlight && 'bg-surface-3',
              )}
            />
          );
        })}
      </div>

      <p role="status" className={clsx('mt-5 flex items-start gap-2 text-sm', finished ? 'text-success' : offline ? 'text-warning' : 'text-muted')}>
        {finished ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : offline ? <WifiOff className="mt-0.5 size-4 shrink-0" /> : <span className="rec-dot mt-1.5 size-2 shrink-0 rounded-full bg-accent-solid" />}
        <span className="tabular-nums">{status}</span>
      </p>
    </div>
  );
}
