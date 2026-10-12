'use client';

import clsx from 'clsx';
import type Hls from 'hls.js';
import { Maximize, Minimize, Pause, Play, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { formatDuration } from '@/lib/format';
import type { AssetDetail } from '@/lib/types';
import { Spinner } from '../ui';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Level {
  index: number;
  height: number;
  width: number;
  bitrate: number;
}

/**
 * Плеер (ТЗ §7.2): адаптивное качество HLS с ручным выбором, перемотка с превью кадров,
 * скорость 0.5–2×, громкость, полноэкранный режим, горячие клавиши.
 */
/** globalHotkeys=false — клавиши работают только при фокусе на плеере (например, на главной, чтобы пробел прокручивал страницу) */
export function VideoPlayer({ asset, planMaxHeight, src: srcProp, globalHotkeys = true }: { asset: AssetDetail; planMaxHeight?: number; src?: string; globalHotkeys?: boolean }) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(asset.durationSec ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [autoLevel, setAutoLevel] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<null | 'settings'>(null);
  const [error, setError] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const src = srcProp ?? `/api/assets/${asset.id}/hls/master.m3u8`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    (async () => {
      const { default: HlsLib } = await import('hls.js');
      if (destroyed) return;
      if (HlsLib.isSupported()) {
        const hls = new HlsLib({ capLevelToPlayerSize: false, startLevel: -1, maxBufferLength: 30, enableWorker: true });
        hlsRef.current = hls;
        hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(data.levels.map((l, index) => ({ index, height: l.height, width: l.width, bitrate: l.bitrate })));
        });
        hls.on(HlsLib.Events.LEVEL_SWITCHED, (_e, data) => setAutoLevel(data.level));
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else setError(true);
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS — встроенный HLS
        video.src = src;
      } else {
        setError(true);
      }
    })();
    return () => {
      destroyed = true;
      // Страница может остаться скрытой (Activity): видео останавливается, плеер освобождается
      video.pause();
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seekBy = useCallback((d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen();
    else (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Горячие клавиши работают, пока страница файла открыта и фокус не в поле ввода
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'j':
        case 'J':
          seekBy(-10);
          break;
        case 'l':
        case 'L':
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          v.muted = !v.muted;
          break;
      }
    };
    const target: HTMLElement | Window | null = globalHotkeys ? window : wrapRef.current;
    target?.addEventListener('keydown', onKey as EventListener);
    return () => target?.removeEventListener('keydown', onKey as EventListener);
  }, [toggle, seekBy, toggleFullscreen, globalHotkeys]);

  const showControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2500);
  };

  const setQuality = (idx: number) => {
    const hls = hlsRef.current;
    if (hls) hls.currentLevel = idx;
    setLevel(idx);
    setMenu(null);
  };

  const sprite = asset.sprite;
  const spriteStyle = (sec: number) => {
    if (!sprite) return undefined;
    const i = Math.min(sprite.count - 1, Math.floor(sec / sprite.interval));
    const col = i % sprite.cols;
    const row = Math.floor(i / sprite.cols);
    return {
      width: sprite.tileW,
      height: sprite.tileH,
      backgroundImage: `url(${sprite.url})`,
      backgroundPosition: `-${col * sprite.tileW}px -${row * sprite.tileH}px`,
      backgroundSize: `${sprite.cols * sprite.tileW}px ${sprite.rows * sprite.tileH}px`,
    };
  };

  const qLabel = (h: number, w: number) => {
    const s = Math.min(h, w);
    return s >= 2160 ? '2160p 4K' : `${s}p`;
  };
  const sortedLevels = [...levels].sort((a, b) => b.height - a.height);
  const current = level >= 0 ? levels[level] : autoLevel !== null ? levels[autoLevel] : undefined;
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      data-mascot-avoid
      tabIndex={globalHotkeys ? undefined : 0}
      className={clsx('group relative flex w-full items-center justify-center overflow-hidden bg-black', fullscreen ? 'h-full' : 'aspect-video max-h-[75vh] rounded-xl')}
      onMouseMove={showControls}
      onMouseLeave={() => !videoRef.current?.paused && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        poster={asset.thumbLg ?? undefined}
        playsInline
        preload="metadata"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onError={() => !hlsRef.current && setError(true)}
      />

      {waiting && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="size-10 text-white" />
        </div>
      )}
      {!playing && !waiting && !error && (
        <button type="button" onClick={toggle} aria-label={t('player.play')} className="absolute flex size-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform hover:scale-105">
          <Play className="ml-1 size-7 fill-white" />
        </button>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
          <p>{t('player.error')}</p>
        </div>
      )}

      <div className={clsx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-10 text-white transition-opacity', controlsVisible || !playing ? 'opacity-100' : 'opacity-0')}>
        {/* Перемотка с превью кадров из спрайта */}
        <div
          className="relative h-5 cursor-pointer"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
            setHover({ x, t: (x / r.width) * duration });
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const v = videoRef.current;
            if (v && duration) v.currentTime = ((e.clientX - r.left) / r.width) * duration;
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            aria-label="Позиция"
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
          {hover && (
            <div className="pointer-events-none absolute bottom-6 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: hover.x }}>
              {sprite && <div className="overflow-hidden rounded-md border border-white/30 shadow-lg" style={spriteStyle(hover.t)} />}
              <span className="rounded bg-black/80 px-1.5 py-0.5 text-xs">{formatDuration(hover.t)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={toggle} aria-label={playing ? t('player.pause') : t('player.play')} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
            {playing ? <Pause className="size-5 fill-white" /> : <Play className="size-5 fill-white" />}
          </button>
          <button type="button" onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }} aria-label={muted ? t('player.unmute') : t('player.mute')} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
            {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Громкость"
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = Number(e.target.value);
              v.muted = v.volume === 0;
            }}
            className="hidden w-20 accent-white sm:block"
          />
          <span className="ml-2 text-xs tabular-nums text-white/85">
            {formatDuration(time)} / {formatDuration(duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {current && <span className="hidden rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold sm:inline">{qLabel(current.height, current.width)}{level < 0 ? ` · ${t('player.auto')}` : ''}</span>}
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => (m ? null : 'settings'))} aria-label={t('player.quality')} aria-expanded={menu === 'settings'} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
                <Settings2 className="size-5" />
              </button>
              {menu === 'settings' && (
                <div className="absolute bottom-11 right-0 w-56 rounded-xl border border-white/15 bg-black/90 p-2 text-sm backdrop-blur">
                  <p className="px-2 pb-1 text-xs text-white/60">{t('player.quality')}</p>
                  <button type="button" onClick={() => setQuality(-1)} className={clsx('w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10', level === -1 && 'text-accent')}>
                    {t('player.auto')}
                  </button>
                  {sortedLevels.map((l) => (
                    <button key={l.index} type="button" onClick={() => setQuality(l.index)} className={clsx('w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10', level === l.index && 'text-accent')}>
                      {qLabel(l.height, l.width)}
                    </button>
                  ))}
                  {planMaxHeight !== undefined && planMaxHeight < 2160 && Math.min(asset.width ?? 0, asset.height ?? 0) > planMaxHeight && (
                    <p className="px-2 pt-1 text-xs text-white/60">{t('player.planLimit')}</p>
                  )}
                  <p className="mt-2 border-t border-white/10 px-2 pb-1 pt-2 text-xs text-white/60">{t('player.speed')}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSpeed(s);
                          if (videoRef.current) videoRef.current.playbackRate = s;
                        }}
                        className={clsx('rounded-lg px-2 py-1 hover:bg-white/10', speed === s && 'bg-white/15 text-accent')}
                      >
                        {s === 1 ? t('player.normal') : `${s}×`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10">
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
