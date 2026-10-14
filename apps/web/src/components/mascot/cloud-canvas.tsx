'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { loadCloudBody } from './cloud-body';
import type { CloudPose } from './cloud-model';
import { CloudScene } from './cloud-scene';

export interface CloudCanvasProps {
  pose: CloudPose;
  /** Направление полёта вдоль края экрана */
  drift?: -1 | 0 | 1;
  reducedMotion: boolean;
  width: number;
  height: number;
  /** Глаза следят за курсором */
  followCursor?: boolean;
  /** Увеличивается при каждом нажатии — облачко сжимается, подпрыгивает и жмурится */
  pokes?: number;
  onReady?: () => void;
  onFail?: () => void;
}

/** Холст Three.js. Загружается отдельным чанком после основного содержимого, на LCP не влияет (ТЗ маскота §9). */
export default function CloudCanvas({ pose, drift = 0, reducedMotion, width, height, followCursor = true, pokes = 0, onReady, onFail }: CloudCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CloudScene | null>(null);
  const latest = useRef({ pose, drift, reducedMotion, width, height, onReady, onFail });
  useLayoutEffect(() => {
    latest.current = { pose, drift, reducedMotion, width, height, onReady, onFail };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: CloudScene | null = null;
    let io: IntersectionObserver | null = null;
    const attempt = () =>
      loadCloudBody()
        .then(init)
        .catch(() => {
          if (disposed) return;
          // Нет сети — дождёмся связи и повторим; иначе — плоская версия
          if (!navigator.onLine) window.addEventListener('online', attempt, { once: true });
          else latest.current.onFail?.();
        });
    const init = (body: Awaited<ReturnType<typeof loadCloudBody>>) => {
      if (disposed) return;
      const p = latest.current;
      scene = new CloudScene(canvas, body, { reducedMotion: p.reducedMotion });
      sceneRef.current = scene;
      scene.resize(p.width, p.height);
      scene.snap(p.pose);
      scene.setDrift(p.drift);
      scene.start();
      io = new IntersectionObserver(([e]) => scene?.setOnScreen(e.isIntersecting));
      io.observe(canvas);
      p.onReady?.();
    };
    void attempt();
    return () => {
      disposed = true;
      window.removeEventListener('online', attempt);
      io?.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => sceneRef.current?.setPose(pose), [pose]);
  useEffect(() => sceneRef.current?.setDrift(drift), [drift]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);
  useEffect(() => sceneRef.current?.resize(width, height), [width, height]);
  useEffect(() => {
    if (pokes) sceneRef.current?.poke();
  }, [pokes]);

  useEffect(() => {
    if (!followCursor || reducedMotion) {
      sceneRef.current?.setLook(0, 0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.45;
      sceneRef.current?.setLook((e.clientX - cx) / (window.innerWidth / 2), (e.clientY - cy) / (window.innerHeight / 2));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [followCursor, reducedMotion]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height }} className="block" aria-hidden />;
}
