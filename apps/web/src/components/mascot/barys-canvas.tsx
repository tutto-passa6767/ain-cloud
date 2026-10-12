'use client';

import { useEffect, useRef } from 'react';
import type { BarysPose } from './barys-model';
import { BarysScene } from './barys-scene';

export interface BarysCanvasProps {
  pose: BarysPose;
  pedestal: boolean;
  walking: -1 | 0 | 1;
  reducedMotion: boolean;
  width: number;
  height: number;
  /** Следить головой за курсором */
  followCursor?: boolean;
  onReady?: () => void;
  onFail?: () => void;
}

/** Холст Three.js. Загружается отдельным чанком после основного содержимого, на LCP не влияет. */
export default function BarysCanvas({ pose, pedestal, walking, reducedMotion, width, height, followCursor = true, onReady, onFail }: BarysCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BarysScene | null>(null);
  const firstPose = useRef(pose);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: BarysScene;
    try {
      scene = new BarysScene(canvas, { reducedMotion, pedestal });
    } catch {
      onFail?.();
      return;
    }
    sceneRef.current = scene;
    scene.snap(firstPose.current);
    scene.resize(width, height);
    scene.start();
    onReady?.();
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // Сцена создаётся один раз; остальные свойства применяются эффектами ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.setPose(pose), [pose]);
  useEffect(() => sceneRef.current?.setPedestal(pedestal), [pedestal]);
  useEffect(() => sceneRef.current?.setWalking(walking), [walking]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);
  useEffect(() => sceneRef.current?.resize(width, height), [width, height]);

  useEffect(() => {
    if (!followCursor || reducedMotion) {
      sceneRef.current?.setLook(0, 0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.35;
      sceneRef.current?.setLook((e.clientX - cx) / (window.innerWidth / 2), (e.clientY - cy) / (window.innerHeight / 2));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [followCursor, reducedMotion]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height }} className="block" />;
}
