'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CloudIcon } from './cloud-icon';
import type { CloudPose } from './cloud-model';
import { webglAvailable } from './cloud-scene';
import { useCloudCanvas } from './use-cloud-canvas';

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
/** Системная настройка «уменьшение движения» (ТЗ маскота §7, вариант 5) */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

const NARROW = '(max-width: 640px)';
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

/**
 * Крупное Облачко рядом с основным содержимым — лендинг и страницы ошибок (ТЗ маскота §6).
 * Модель грузится после основного содержимого (на LCP не влияет); без WebGL — плоская версия того же состояния.
 */
export function MascotStage({ pose, size, narrowSize, label }: { pose: CloudPose; size: [number, number]; narrowSize?: [number, number]; label?: string }) {
  const [width, height] = useNarrow() && narrowSize ? narrowSize : size;
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const [pokes, setPokes] = useState(0);
  const { Canvas: CloudCanvas, failed } = useCloudCanvas(webgl === true);
  useEffect(() => {
    const go = () => setWebgl(webglAvailable());
    let id: ReturnType<typeof setTimeout> | undefined;
    if (document.readyState === 'complete') id = setTimeout(go, 200);
    else window.addEventListener('load', go, { once: true });
    return () => {
      clearTimeout(id);
      window.removeEventListener('load', go);
    };
  }, []);
  return (
    <button
      type="button"
      onClick={() => setPokes((n) => n + 1)}
      aria-label={label}
      className="relative block cursor-pointer rounded-3xl"
      style={{ width, height }}
    >
      {webgl && CloudCanvas ? (
        <CloudCanvas pose={pose} pokes={pokes} reducedMotion={reduced} width={width} height={height} onFail={() => setWebgl(false)} />
      ) : webgl === false || failed ? (
        <span className="flex size-full items-center justify-center">
          <CloudIcon size={Math.round(Math.min(width, height) * 0.8)} mood={pose} className={reduced ? undefined : 'mascot-float'} />
        </span>
      ) : null}
    </button>
  );
}
