'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';

export interface Point {
  label: string;
  value: number;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v * 10) / 10));

/**
 * Столбчатый график одного ряда: величина по дням (последовательная шкала — один оттенок).
 * Столбцы не толще 24px, скругление 4px у вершины, тонкая сетка, подсказка при наведении,
 * таблица значений как альтернатива для скринридеров и печати.
 */
export function ColumnChart({ title, points, format = compact }: { title: string; points: Point[]; format?: (v: number) => string }) {
  const { t } = useI18n();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 36, r: 8, t: 12, b: 24 };
  const max = useMemo(() => niceMax(Math.max(0, ...points.map((p) => p.value))), [points]);
  const band = (W - pad.l - pad.r) / Math.max(1, points.length);
  const bar = Math.min(24, band - 2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];

  return (
    <figure className="rounded-xl glass p-4" aria-labelledby={`${id}-t`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption id={`${id}-t`} className="text-sm font-semibold">
          {title}
        </figcaption>
        <button type="button" onClick={() => setTable((v) => !v)} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg" aria-pressed={table}>
          {t('admin.charts.table')}
        </button>
      </div>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('admin.charts.noData')}</p>
      ) : table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">{t('admin.charts.day')}</th>
              <th className="py-1 text-right font-medium">{t('admin.charts.value')}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {points.map((p) => (
              <tr key={p.label} className="border-t border-border">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={wrap} className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--fg-subtle)" className="tabular-nums">
                  {compact(v)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = pad.l + band * i + band / 2;
              const top = y(p.value);
              const h = Math.max(0, y(0) - top);
              const r = Math.min(4, h, bar / 2);
              // Скругление только у вершины, у основания столбец прямой
              const d = h > 0
                ? `M${cx - bar / 2},${y(0)} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${y(0)} Z`
                : '';
              return (
                <g key={p.label}>
                  {d && <path d={d} fill="var(--chart-1)" opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {/* Зона наведения шире самого столбца */}
                  <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${p.label}: ${format(p.value)}`} />
                  {(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 7) === 0) && (
                    <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--fg-subtle)">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg glass-strong px-2.5 py-1.5 text-xs"
              style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100}%` }}
            >
              <span className="text-muted">{points[hover].label}</span> · <span className="font-semibold">{format(points[hover].value)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Плитка-показатель: подпись, значение (без цвета данных — только текстовые токены) */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl glass p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
