import { forwardRef, useId } from 'react';

/** Детерминированный генератор: одинаковая картинка на сервере и в браузере */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = rng(7);
const STARS = Array.from({ length: 70 }, () => ({ x: r1() * 1600, y: r1() * 330, r: 0.6 + r1() * 1.4, o: 0.25 + r1() * 0.6 }));
const r2 = rng(42);
const LIGHTS = Array.from({ length: 260 }, () => ({ x: r2() * 1600, y: 812 + r2() * 80, w: 1.5 + r2() * 3, o: 0.35 + r2() * 0.65 }));

// Снежные шапки Заилийского Алатау: вершина и её «юбка»
const PEAKS: [number, number][] = [
  [330, 470],
  [520, 430],
  [720, 450],
  [930, 418],
  [1150, 460],
  [1380, 470],
];

/**
 * Закат над Алматы: небо в фирменных тонах, снежные пики, огни города и башня на Кок-Тобе.
 * Мелкие детали (звёзды, огни, антенна) специально тонкие — на них видно, как мессенджер портит кадр.
 */
export const AlmatyScene = forwardRef<SVGSVGElement, { className?: string }>(function AlmatyScene({ className }, ref) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg ref={ref} viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0207" />
          <stop offset="0.32" stopColor="#3d0710" />
          <stop offset="0.56" stopColor="#a3132a" />
          <stop offset="0.72" stopColor="#f2481f" />
          <stop offset="0.8" stopColor="#ffb06a" />
        </linearGradient>
        <radialGradient id={`${id}sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd9a8" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ff8a3d" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a1220" />
          <stop offset="1" stopColor="#2a060d" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#${id}sky)`} />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} fill="#fff" opacity={s.o.toFixed(2)} />
      ))}
      <circle cx="1060" cy="600" r="260" fill={`url(#${id}sun)`} />
      <circle cx="1060" cy="600" r="64" fill="#ffe2bd" />
      {/* Дальний хребет со снегом */}
      <path
        d="M0 640 L120 560 L210 600 L330 470 L420 540 L520 430 L610 520 L720 450 L820 530 L930 418 L1040 520 L1150 460 L1260 540 L1380 470 L1490 560 L1600 520 V900 H0 Z"
        fill={`url(#${id}far)`}
      />
      {PEAKS.map(([x, y]) => (
        <path key={x} d={`M${x - 34} ${y + 34} L${x} ${y} L${x + 36} ${y + 38} L${x + 18} ${y + 30} L${x + 6} ${y + 42} L${x - 10} ${y + 30} Z`} fill="#ffe7dc" opacity="0.88" />
      ))}
      {/* Средний хребет */}
      <path d="M0 720 L150 640 L260 690 L400 612 L540 700 L700 630 L860 712 L1000 650 L1150 722 L1300 662 L1450 722 L1600 680 V900 H0 Z" fill="#1f050b" />
      {/* Предгорья и город */}
      <path d="M0 792 Q200 742 400 782 T800 772 T1200 792 T1600 762 V900 H0 Z" fill="#0b0205" />
      {/* Башня на Кок-Тобе */}
      <path d="M1236 778 L1242 560 L1248 778 Z" fill="#160409" />
      <line x1="1242" y1="560" x2="1242" y2="520" stroke="#160409" strokeWidth="2" />
      <circle cx="1242" cy="518" r="3.2" fill="#ff4d5e" />
      {LIGHTS.map((l, i) => (
        <rect key={i} x={l.x.toFixed(1)} y={l.y.toFixed(1)} width={l.w.toFixed(1)} height="1.6" rx="0.8" fill="#ffc07a" opacity={l.o.toFixed(2)} />
      ))}
    </svg>
  );
});
