'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Maximize, Pause, Play, ZoomIn, ZoomOut, Expand } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AssetDetail } from '@/lib/types';
import { Spinner } from '../ui';

/**
 * Просмотр фото (ТЗ §7.3): зум, перемещение увеличенного изображения, переход к соседним фото,
 * слайд-шоу. Показывается версия для просмотра 2560 px — оригинал не скачивается.
 */
export function PhotoViewer({ asset, prevId, nextId, hrefFor = (id) => `/drive/file/${id}` }: { asset: AssetDetail; prevId: string | null; nextId: string | null; hrefFor?: (id: string) => string }) {
  const { t } = useI18n();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const src = asset.preview ?? asset.thumbLg;

  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
    setLoaded(false);
  }, [asset.id]);

  const go = useCallback((id: string | null) => id && router.push(hrefFor(id)), [router, hrefFor]);

  // Слайд-шоу: следующее фото каждые 4 секунды
  useEffect(() => {
    if (!slideshow) return;
    if (!nextId) {
      setSlideshow(false);
      return;
    }
    const id = setTimeout(() => go(nextId), 4000);
    return () => clearTimeout(id);
  }, [slideshow, nextId, go, asset.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [role="dialog"]')) return;
      if (e.key === 'ArrowLeft') go(prevId);
      if (e.key === 'ArrowRight') go(nextId);
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(8, s * 1.25));
      if (e.key === '-') setScale((s) => Math.max(1, s / 1.25));
      if (e.key === '0') {
        setScale(1);
        setPos({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, prevId, nextId]);

  const zoom = useCallback((factor: number) => {
    setScale((s) => {
      const n = Math.max(1, Math.min(8, s * factor));
      if (n === 1) setPos({ x: 0, y: 0 });
      return n;
    });
  }, []);

  // Колесо мыши масштабирует; обработчик не пассивный, чтобы страница не прокручивалась
  const zoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, src]);

  return (
    <div ref={wrapRef} data-mascot-avoid className="relative flex aspect-[4/3] max-h-[75vh] w-full select-none items-center justify-center overflow-hidden rounded-xl bg-black">
      {!src ? (
        <Spinner className="size-8" />
      ) : (
        <div
          ref={zoneRef}
          className={clsx('flex size-full items-center justify-center', scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
          onDoubleClick={() => (scale > 1 ? (setScale(1), setPos({ x: 0, y: 0 })) : setScale(2.5))}
          onPointerDown={(e) => {
            if (scale <= 1) return;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setPos({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={asset.name}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={clsx('max-h-full max-w-full object-contain transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: drag.current ? 'none' : 'transform 120ms ease-out' }}
          />
          {!loaded && <Spinner className="absolute size-8" />}
        </div>
      )}

      {prevId && (
        <button type="button" onClick={() => go(prevId)} aria-label={t('file.prev')} className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75">
          <ChevronLeft className="size-5" />
        </button>
      )}
      {nextId && (
        <button type="button" onClick={() => go(nextId)} aria-label={t('file.next')} className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75">
          <ChevronRight className="size-5" />
        </button>
      )}

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-black/60 p-1 text-white backdrop-blur">
        <button type="button" onClick={() => zoom(1 / 1.25)} aria-label={t('file.zoomOut')} className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
          <ZoomOut className="size-4" />
        </button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoom(1.25)} aria-label={t('file.zoomIn')} className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
          <ZoomIn className="size-4" />
        </button>
        <button type="button" onClick={() => { setScale(1); setPos({ x: 0, y: 0 }); }} aria-label={t('file.fit')} className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
          <Expand className="size-4" />
        </button>
        {nextId && (
          <button type="button" onClick={() => setSlideshow((s) => !s)} aria-label={t('file.slideshow')} aria-pressed={slideshow} className={clsx('flex size-8 items-center justify-center rounded-lg hover:bg-white/10', slideshow && 'text-accent')}>
            {slideshow ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void wrapRef.current?.requestFullscreen?.())}
          aria-label={t('player.fullscreen')}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}
