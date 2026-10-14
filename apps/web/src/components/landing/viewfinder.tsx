'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

/** Бегущий таймкод 25 кадров/с, как на мониторе камеры */
function Timecode() {
  const [tc, setTc] = useState('00:00:12:04');
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now() - 12_160;
    let raf = 0;
    let last = '';
    const tick = (now: number) => {
      const frames = Math.floor((now - start) / 40);
      const f = frames % 25;
      const s = Math.floor(frames / 25);
      const next = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
      if (next !== last) setTc((last = next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span className="tabular-nums">{tc}</span>;
}

function Corner({ className }: { className: string }) {
  return <span className={clsx('pointer-events-none absolute size-7 border-fg/45', className)} aria-hidden />;
}

/** Индикаторы уровня звука в нижнем углу */
function Meters() {
  return (
    <div className="meters flex items-end gap-3" aria-hidden>
      {['L', 'R'].map((ch) => (
        <div key={ch} className="flex items-end gap-1">
          <span className="w-2 text-[10px] text-subtle">{ch}</span>
          <div className="flex h-5 items-end gap-[3px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={clsx('meter w-[3px] rounded-sm', i > 7 ? 'bg-accent-solid' : i > 5 ? 'bg-ember' : 'bg-fg/50')} style={{ height: `${30 + i * 7}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Первый экран в виде монитора камеры: REC, таймкод, формат, сетка третей, уровни звука */
export function Viewfinder({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border bg-[radial-gradient(90%_70%_at_75%_40%,rgba(230,30,50,0.16),transparent_70%)]">
      {/* Сетка третей */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span className="absolute inset-y-0 left-1/3 w-px bg-fg/[0.05]" />
        <span className="absolute inset-y-0 left-2/3 w-px bg-fg/[0.05]" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-fg/[0.05]" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-fg/[0.05]" />
      </div>
      <Corner className="left-4 top-4 rounded-tl-xl border-l-2 border-t-2" />
      <Corner className="right-4 top-4 rounded-tr-xl border-r-2 border-t-2" />
      <Corner className="bottom-4 left-4 rounded-bl-xl border-b-2 border-l-2" />
      <Corner className="bottom-4 right-4 rounded-br-xl border-b-2 border-r-2" />

      <div className="pointer-events-none absolute inset-x-8 top-7 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted" aria-hidden>
        <span className="flex items-center gap-2.5">
          <span className="rec-dot size-2 rounded-full bg-accent-solid shadow-[0_0_10px_var(--accent-solid)]" />
          <span className="text-fg">REC</span>
          <Timecode />
        </span>
        <span className="hidden sm:block">3840 × 2160 · 25p · HDR10</span>
      </div>

      <div className="relative">{children}</div>

      <div className="pointer-events-none absolute inset-x-8 bottom-7 hidden items-end justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-subtle md:flex" aria-hidden>
        <Meters />
        <span>SHA-256 ✓ · RAW · ProRes</span>
      </div>
    </div>
  );
}

/** Рамка автофокуса вокруг объекта в кадре */
export function FocusBox({ label, className }: { label: string; className?: string }) {
  return (
    <div className={clsx('af-box pointer-events-none absolute', className)} aria-hidden>
      <span className="absolute left-0 top-0 size-5 border-l-2 border-t-2 border-accent" />
      <span className="absolute right-0 top-0 size-5 border-r-2 border-t-2 border-accent" />
      <span className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-accent" />
      <span className="absolute bottom-0 right-0 size-5 border-b-2 border-r-2 border-accent" />
      <span className="absolute -top-6 left-0 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">AF · {label}</span>
    </div>
  );
}
