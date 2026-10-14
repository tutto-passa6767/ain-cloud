import { useId } from 'react';
import type { CloudPose } from './cloud-model';

// Плоское Облачко (ТЗ маскота §11): иконка, кнопка «Позвать Облачко» и резервный режим без WebGL.
// Цвета тела по состояниям — те же, что у 3D-модели (ТЗ маскота §3).
const BODY: Record<CloudPose, string> = {
  hello: '#eeeff3',
  idle: '#eeeff3',
  think: '#e9eef6',
  happy: '#f3f4fa',
  angry: '#7a8597',
  confused: '#dde2ec',
  sleep: '#e6ebf6',
};
const INK = '#15171c';
const TONGUE = '#f28a99';

function Eyes({ mood }: { mood: CloudPose }) {
  if (mood === 'happy')
    return <path d="M21.6 37.2q3-4.2 6 0M36.4 37.2q3-4.2 6 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  if (mood === 'sleep')
    return <path d="M21.6 35.6q3 2.6 6 0M36.4 35.6q3 2.6 6 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  // У растерянного один глаз больше
  const r = mood === 'confused' ? [3.1, 3.9] : [3.4, 3.4];
  return (
    <>
      {[24.6, 39.4].map((x, i) => (
        <g key={x}>
          <ellipse cx={x} cy={35.6} rx={r[i]} ry={r[i] * 1.07} fill="#101114" />
          <circle cx={x - r[i] * 0.32} cy={35.6 - r[i] * 0.4} r={r[i] * 0.36} fill="#fff" />
          <circle cx={x + r[i] * 0.38} cy={35.6 + r[i] * 0.38} r={r[i] * 0.15} fill="#fff" />
        </g>
      ))}
    </>
  );
}

function Mouth({ mood }: { mood: CloudPose }) {
  switch (mood) {
    case 'hello':
    case 'happy':
      return (
        <>
          <path d="M29.2 39.6h5.6a2.8 3.4 0 0 1-5.6 0z" fill={INK} />
          <ellipse cx="32" cy="42" rx="1.7" ry="1.1" fill={TONGUE} />
        </>
      );
    case 'think':
      return (
        <>
          <ellipse cx="32" cy="41" rx="1.5" ry="1.9" fill={INK} />
          <ellipse cx="32" cy="41.6" rx="0.9" ry="0.9" fill={TONGUE} />
        </>
      );
    case 'angry':
      return (
        <>
          <ellipse cx="32" cy="41.2" rx="2.6" ry="2.1" fill={INK} />
          <ellipse cx="32" cy="42.4" rx="1.5" ry="0.8" fill={TONGUE} />
        </>
      );
    case 'confused':
      return <path d="M28.6 41.2q0.85-1.2 1.7 0t1.7 0 1.7 0 1.7 0" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />;
    default:
      // кошачий «ω»
      return <path d="M29.4 40.2q1.3 1.9 2.6 0q1.3 1.9 2.6 0" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />;
  }
}

function Effects({ mood }: { mood: CloudPose }) {
  switch (mood) {
    case 'hello':
      return (
        <g fill="#ffd35c">
          <path d="M9 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
          <path d="M55 8l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </g>
      );
    case 'think':
      return (
        <g fill="#e9eef6">
          <circle cx="51" cy="17" r="1.6" />
          <circle cx="54.5" cy="12" r="2.3" />
          <circle cx="58.5" cy="6" r="3.1" />
        </g>
      );
    case 'happy':
      return (
        <g fill="none" strokeWidth="1.6" strokeLinecap="round">
          {['#ff8f8f', '#ffb877', '#ffe27a', '#9be8a6', '#86c8fb', '#b9a3fb'].map((c, i) => (
            <path key={c} d={`M${10 + i * 1.6} 22a${22 - i * 1.6} ${18 - i * 1.6} 0 0 1 ${44 - i * 3.2} 0`} stroke={c} />
          ))}
        </g>
      );
    case 'angry':
      return (
        <>
          <path d="M30 52h4l-1.6 3h2.4l-5 6 1.2-4.2h-2.2z" fill="#ffc93c" />
          <g stroke="#e5484d" strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d="M52 9.5q1.5 1.5 0 3M55.5 9.5q-1.5 1.5 0 3M52 15.5q1.5-1.5 0-3M55.5 15.5q-1.5-1.5 0-3" />
          </g>
        </>
      );
    case 'confused':
      return (
        <text x="51" y="17" fontSize="12" fontWeight="700" fill="#7d95bd" fontFamily="system-ui, sans-serif">
          ?
        </text>
      );
    case 'sleep':
      return (
        <g fill="#8ea6cf" fontWeight="800" fontFamily="system-ui, sans-serif">
          <text x="48" y="17" fontSize="7">
            z
          </text>
          <text x="53" y="11" fontSize="9">
            z
          </text>
        </g>
      );
    default:
      return null;
  }
}

/** Облачко в 2D. Без mood — спокойное «Ожидание» (для логотипа и кнопки «Позвать Облачко»). */
export function CloudIcon({ size = 32, mood = 'idle', className }: { size?: number; mood?: CloudPose; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const body = BODY[mood];
  const brows =
    mood === 'angry' ? 'M21 29.6l6.6 2.4M43 29.6l-6.6 2.4' : mood === 'confused' ? 'M21.6 31.8l5.6-2.2M42.4 31.8l-5.6-2.2' : null;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#5a6478" stopOpacity="0.16" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="22" cy="29" r="12" />
          <circle cx="36.5" cy="23.5" r="14" />
          <circle cx="49" cy="32" r="9.5" />
          <circle cx="12.5" cy="38" r="8.5" />
          <rect x="9" y="30" width="48" height="20" rx="10" />
        </clipPath>
      </defs>
      <Effects mood={mood} />
      {/* Спутники: крупный слева снизу и совсем маленький под облаком */}
      <ellipse cx="6.5" cy="47.5" rx="4.4" ry="3.4" fill={body} />
      <ellipse cx="29" cy="54.5" rx="2.3" ry="1.7" fill={body} />
      {/* Тело: купола сверху, круглые бока, мягкий низ; объём — градиентом по силуэту без швов */}
      <g clipPath={`url(#${id}c)`}>
        <rect width="64" height="64" fill={body} />
        <rect width="64" height="64" fill={`url(#${id}b)`} />
      </g>
      {/* Румянец */}
      <ellipse cx="18.6" cy="41.2" rx="3.4" ry="1.9" fill="#f9848f" opacity="0.5" />
      <ellipse cx="45.4" cy="41.2" rx="3.4" ry="1.9" fill="#f9848f" opacity="0.5" />
      <Eyes mood={mood} />
      {brows && <path d={brows} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />}
      <Mouth mood={mood} />
    </svg>
  );
}
