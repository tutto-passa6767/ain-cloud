// Плоская 2D-версия Барыса: для кнопки «Позвать Барыса» и запасного показа без WebGL (ТЗ §13.5–13.6).
// Палитра модели: белый мех, ледяной голубой, серо-голубые пятна и уши, эмблема #2EF2A3 на тёмном круге.

export type IconMood = 'idle' | 'happy' | 'sleep' | 'confused' | 'think' | 'wave';

export function BarysIcon({ size = 40, mood = 'idle', className }: { size?: number; mood?: IconMood; className?: string }) {
  const closed = mood === 'sleep';
  const happy = mood === 'happy' || mood === 'wave';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      {/* уши */}
      <ellipse cx="15" cy="17" rx="8" ry="7.5" fill="#a9b6c9" />
      <ellipse cx="49" cy="17" rx="8" ry="7.5" fill="#a9b6c9" />
      <ellipse cx="15.5" cy="18" rx="4.5" ry="4" fill="#e2e8f1" />
      <ellipse cx="48.5" cy="18" rx="4.5" ry="4" fill="#e2e8f1" />
      {/* голова */}
      <ellipse cx="32" cy="34" rx="25" ry="22" fill="#f4f6fa" />
      {/* пятна */}
      <circle cx="32" cy="15" r="2.6" fill="#a9b6c9" />
      <circle cx="24" cy="17" r="2" fill="#a9b6c9" />
      <circle cx="40" cy="17" r="2" fill="#a9b6c9" />
      <circle cx="12" cy="32" r="2.2" fill="#a9b6c9" />
      <circle cx="52" cy="32" r="2.2" fill="#a9b6c9" />
      <circle cx="15" cy="41" r="4.4" fill="#a9b6c9" opacity="0.55" />
      <circle cx="49" cy="41" r="4.4" fill="#a9b6c9" opacity="0.55" />
      {/* глаза */}
      <ellipse cx="23" cy="33" rx="6.5" ry="5" fill="#a9b6c9" />
      <ellipse cx="41" cy="33" rx="6.5" ry="5" fill="#a9b6c9" />
      {closed || happy ? (
        <>
          <path d={happy ? 'M19.5 34.5 q3.5 -4.5 7 0' : 'M19.5 33 q3.5 3 7 0'} stroke="#1c2638" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d={happy ? 'M37.5 34.5 q3.5 -4.5 7 0' : 'M37.5 33 q3.5 3 7 0'} stroke="#1c2638" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="23.5" cy="33.5" r="3.4" fill="#1c2638" />
          <circle cx="41.5" cy="33.5" r="3.4" fill="#1c2638" />
          <circle cx="25" cy="32" r="1" fill="#fff" />
          <circle cx="43" cy="32" r="1" fill="#fff" />
          {mood === 'confused' && <path d="M36 26.5 l9 1.5" stroke="#7f90a9" strokeWidth="1.6" strokeLinecap="round" />}
        </>
      )}
      {/* мордочка */}
      <ellipse cx="32" cy="43" rx="8" ry="5.5" fill="#ffffff" />
      <ellipse cx="32" cy="40" rx="2.6" ry="1.6" fill="#7f90a9" />
      {mood === 'confused' ? (
        <path d="M28.5 46.5 q3.5 -2 7 0" stroke="#1c2638" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M28.5 44.5 q1.75 1.8 3.5 0 q1.75 1.8 3.5 0" stroke="#1c2638" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Эмблема на груди: зелёный знак на тёмном круге со светлым ободком */
export function BarysEmblem({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#16233a" stroke="#c9d3df" strokeWidth="1" />
      <rect x="5" y="7" width="10" height="6" rx="2" fill="#2ef2a3" />
    </svg>
  );
}
