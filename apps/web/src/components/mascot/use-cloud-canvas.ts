'use client';

import { useEffect, useState, type ComponentType } from 'react';
import type { CloudCanvasProps } from './cloud-canvas';

let loaded: ComponentType<CloudCanvasProps> | null = null;

/**
 * Холст Облачка — отдельный чанк, загружается после основного содержимого (ТЗ маскота §9).
 * Если в этот момент пропала сеть, страница не падает: показывается плоская версия, а при появлении связи — повтор.
 */
export function useCloudCanvas(want: boolean) {
  const [Canvas, setCanvas] = useState<ComponentType<CloudCanvasProps> | null>(() => loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!want || loaded) return;
    let off = false;
    const load = () =>
      import('./cloud-canvas')
        .then((m) => {
          loaded = m.default;
          if (off) return;
          setCanvas(() => m.default);
          setFailed(false);
        })
        .catch(() => {
          if (!off) setFailed(true);
        });
    void load();
    const onOnline = () => {
      if (!loaded) void load();
    };
    window.addEventListener('online', onOnline);
    return () => {
      off = true;
      window.removeEventListener('online', onOnline);
    };
  }, [want]);
  return { Canvas, failed };
}
