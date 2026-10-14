'use client';

import clsx from 'clsx';
import { Ellipsis, EyeOff, Minimize2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { Menu, MenuItem } from '../ui';
import { CloudIcon } from './cloud-icon';
import { useMascot } from './mascot-context';
import { webglAvailable } from './cloud-scene';
import { useCloudCanvas } from './use-cloud-canvas';
import { useReducedMotion } from './mascot-stage';

// В «Ожидании», «Думает» и «Растерян» облачко медленно проплывает вдоль нижнего края (ТЗ маскота §6)
const FLOATING = new Set(['idle', 'think', 'confused']);
const SPEED = 55; // px/с
const DRAG_THRESHOLD = 5; // px — меньше считается кликом
const POS_KEY = 'ain-mascot-pos';

/** Место, куда пользователь переставил Облачко: доли ширины и высоты окна, чтобы переживать смену размера */
type UserPos = { fx: number; fy: number };

const loadPos = (): UserPos | null => {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    return v && typeof v.fx === 'number' && typeof v.fy === 'number' ? v : null;
  } catch {
    return null;
  }
};
const savePos = (p: UserPos | null) => {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
    else localStorage.removeItem(POS_KEY);
  } catch {
    /* приватный режим — позиция просто не запомнится */
  }
};

/** Автоскрытие (ТЗ маскота §7, вариант 4): полноэкранный просмотр, открытая клавиатура на телефоне, модальные окна */
function useAutoHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const check = () => {
      const fullscreen = !!document.fullscreenElement;
      const modal = document.body.dataset.modalOpen === '1';
      const vv = window.visualViewport;
      const keyboard = !!vv && matchMedia('(pointer: coarse)').matches && vv.height < window.innerHeight * 0.75;
      setHidden(fullscreen || modal || keyboard);
    };
    check();
    document.addEventListener('fullscreenchange', check);
    window.visualViewport?.addEventListener('resize', check);
    const mo = new MutationObserver(check);
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-modal-open'] });
    return () => {
      document.removeEventListener('fullscreenchange', check);
      window.visualViewport?.removeEventListener('resize', check);
      mo.disconnect();
    };
  }, []);
  return hidden;
}

/** Свободные промежутки нижней полосы экрана с учётом рабочих зон ([data-mascot-avoid]) */
function freeSpans(bandTop: number, half: number): [number, number][] {
  const vw = window.innerWidth;
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-mascot-avoid]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > bandTop && r.top < window.innerHeight)
    .map((r) => [r.left - half - 8, r.right + half + 8] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let cur = half + 8;
  for (const [l, r] of blocks) {
    if (l > cur) spans.push([cur, l]);
    cur = Math.max(cur, r);
  }
  if (vw - half - 8 > cur) spans.push([cur, vw - half - 8]);
  return spans.filter(([a, b]) => b - a >= 0);
}

export function MascotOverlay() {
  const m = useMascot();
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const autoHidden = useAutoHidden();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const [blocked, setBlocked] = useState(false);
  const [userPos, setUserPos] = useState<UserPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bubbleBelow, setBubbleBelow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const target = useRef<number | null>(null);
  const xRef = useRef<number | null>(null);
  const yRef = useRef(0);
  const userPosRef = useRef<UserPos | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Тело облачка — около 120–160 px на десктопе и 80–100 px на телефоне; в онбординге — крупнее (ТЗ маскота §6)
  // Three.js и модель грузятся отдельным чанком только когда маскот включён
  const { Canvas: CloudCanvas, failed: canvasFailed } = useCloudCanvas(m.mode === 'ON' && webgl === true);
  const size = m.large ? (mobile ? { w: 200, h: 155 } : { w: 300, h: 232 }) : mobile ? { w: 130, h: 100 } : { w: 200, h: 155 };
  const half = size.w / 2;
  // Во время онбординга Облачко стоит на своём месте — переставлять нельзя
  const movable = !m.onboarding;

  useEffect(() => {
    const p = loadPos();
    userPosRef.current = p;
    setUserPos(p);
  }, []);

  // Модель загружается после основного содержимого страницы — на LCP не влияет (ТЗ маскота §9)
  useEffect(() => {
    const go = () => setWebgl(webglAvailable());
    if (document.readyState === 'complete') {
      const id = (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300)))(go);
      return () => (window.cancelIdleCallback ?? clearTimeout)(id as number);
    }
    window.addEventListener('load', go, { once: true });
    return () => window.removeEventListener('load', go);
  }, []);

  useEffect(() => {
    const on = () => setMobile(window.innerWidth < 768);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const clampX = useCallback((x: number) => Math.min(Math.max(x, half + 4), window.innerWidth - half - 4), [half]);
  const clampY = useCallback((y: number) => Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - size.h - 4)), [size.h]);

  /** Положение пишется прямо в стиль, без перерисовки React */
  const apply = useCallback(
    (x: number, y: number) => {
      xRef.current = x;
      yRef.current = y;
      const box = boxRef.current;
      if (!box) return;
      box.style.transform = `translate(${x - half}px, ${-y}px)`;
      // Реплика не выходит за край экрана; у верхнего края — показывается под Облачком
      const bw = 136;
      const shift = Math.max(bw + 8 - x, Math.min(0, window.innerWidth - bw - 8 - x));
      box.style.setProperty('--bubble-shift', `${shift}px`);
      const below = window.innerHeight - (y + size.h) < 150;
      setBubbleBelow((b) => (b === below ? b : below));
      setPlaced(true);
    },
    [half, size.h],
  );

  useEffect(() => {
    if (m.mode !== 'ON') return;
    let raf = 0;
    let last = performance.now();
    let pickAt = 0;
    let spans: [number, number][] = [];
    let spansAt = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (drag.current?.moved) return;

      // Пользователь поставил Облачко сам — оно остаётся на этом месте (кроме онбординга)
      const up = userPosRef.current;
      if (up && movable) {
        setBlocked(false);
        setDir((d) => (d === 0 ? d : 0));
        const x = clampX(up.fx * window.innerWidth);
        const y = clampY(up.fy * window.innerHeight);
        if (xRef.current === null || Math.abs(x - xRef.current) > 0.3 || Math.abs(y - yRef.current) > 0.3) apply(x, y);
        return;
      }

      // Иначе — полёт вдоль нижнего края, рабочие зоны обходятся (ТЗ маскота §6)
      if (now - spansAt > 330) {
        spans = freeSpans(window.innerHeight - size.h, half);
        spansAt = now;
        setBlocked(spans.length === 0);
      }
      if (!spans.length) return;
      const inSpan = (v: number) => spans.some(([a, b]) => v >= a && v <= b);
      const nearest = (v: number) => {
        let best = spans[0][0];
        for (const [a, b] of spans) {
          const c = Math.min(Math.max(v, a), b);
          if (Math.abs(c - v) < Math.abs(best - v)) best = c;
        }
        return best;
      };
      let cur = xRef.current ?? nearest(window.innerWidth - half - 24);
      const canWalk = FLOATING.has(m.mood) && !reduced && !mobile && !m.onboarding;
      if (canWalk && now > pickAt && (target.current === null || Math.abs(target.current - cur) < 2)) {
        // Проплыло — зависает и смотрит на пользователя, потом выбирает новую точку
        const span = spans[Math.floor(Math.random() * spans.length)];
        target.current = span[0] + Math.random() * (span[1] - span[0]);
        pickAt = now + 2500 + Math.random() * 3500;
      }
      if (!canWalk) target.current = inSpan(cur) ? null : nearest(cur);
      if (target.current !== null && !inSpan(target.current)) target.current = nearest(target.current);

      let newDir: -1 | 0 | 1 = 0;
      if (target.current !== null && Math.abs(target.current - cur) > 2) {
        // Без полёта (остальные состояния, «уменьшение движения») — сразу на свободное место
        const step = canWalk ? SPEED * dt : Infinity;
        newDir = target.current > cur ? 1 : -1;
        cur = Math.abs(target.current - cur) <= step ? target.current : cur + newDir * step;
        if (!canWalk) newDir = 0;
      } else if (target.current !== null) {
        target.current = null;
      }
      if (xRef.current === null || Math.abs(cur - xRef.current) > 0.3 || yRef.current !== 0) apply(cur, 0);
      setDir((d) => (d === newDir ? d : newDir));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [m.mode, m.mood, m.onboarding, reduced, mobile, half, size.h, movable, apply, clampX, clampY]);

  const placeAt = useCallback(
    (x: number, y: number) => {
      const p = { fx: x / window.innerWidth, fy: y / window.innerHeight };
      userPosRef.current = p;
      setUserPos(p);
      savePos(p);
    },
    [],
  );

  const resetPosition = () => {
    userPosRef.current = null;
    setUserPos(null);
    savePos(null);
    target.current = null;
  };

  // ---------- перетаскивание мышью и пальцем ----------

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!movable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: xRef.current ?? window.innerWidth - half - 24, oy: yRef.current, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    apply(clampX(d.ox + dx), clampY(d.oy - dy));
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      placeAt(xRef.current ?? 0, yRef.current);
      setDragging(false);
      // Отпускание после перетаскивания — не клик
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  /** С клавиатуры: стрелки переставляют Облачко (Shift — шагом крупнее) */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!movable) return;
    const step = e.shiftKey ? 64 : 16;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    const x = clampX((xRef.current ?? window.innerWidth - half - 24) + mv[0]);
    const y = clampY(yRef.current + mv[1]);
    apply(x, y);
    placeAt(x, y);
  };

  if (m.mode === 'OFF') return null;

  if (m.mode === 'COLLAPSED') {
    return (
      <button
        type="button"
        onClick={() => m.setMode('ON')}
        className="fixed bottom-4 left-4 z-30 flex items-center gap-2 rounded-full glass py-1.5 pl-1.5 pr-3.5 text-sm shadow-pop transition-colors hover:bg-surface-2 lg:left-[17rem]"
        title={t('mascot.call')}
      >
        <CloudIcon size={30} />
        <span className="hidden sm:inline">{t('mascot.call')}</span>
      </button>
    );
  }

  // Переставленное пользователем Облачко рабочие зоны не прячут — оно там, где его оставили
  const hidden = autoHidden || (blocked && !(userPos && movable)) || !placed;
  // Пока Облачко несут — оно радуется
  const pose = dragging ? 'happy' : m.mood;
  const bubble = m.bubble;

  return (
    <div
      ref={boxRef}
      className={clsx('pointer-events-none fixed bottom-0 left-0 z-30 transition-opacity duration-300', hidden ? 'invisible opacity-0' : 'opacity-100')}
      style={{ width: size.w }}
      aria-hidden={hidden}
      data-mascot-mood={pose}
    >
      {bubble && !hidden && !dragging && (
        <div
          className={clsx(
            'animate-pop pointer-events-auto absolute w-64 rounded-2xl glass-strong px-4 py-3 text-sm',
            bubbleBelow ? 'top-full mt-1' : 'bottom-full mb-1',
            bubble.urgent && 'border-warning/50',
          )}
          style={{ left: '50%', transform: 'translateX(calc(-50% + var(--bubble-shift, 0px)))' }}
          // Реплики — вежливо, ошибки — сразу (ТЗ маскота §10); исчезают по клику
          role={bubble.urgent ? 'alert' : 'status'}
          aria-live={bubble.urgent ? 'assertive' : 'polite'}
          onClick={() => !m.onboarding && m.dismissBubble()}
        >
          <p>{bubble.text}</p>
          {m.onboarding && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {m.onboarding.step + 1}/{m.onboarding.total}
              </span>
              <div className="flex gap-1">
                <button type="button" className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2" onClick={m.finishOnboarding}>
                  {t('common.skip')}
                </button>
                <button type="button" className="btn-primary rounded-full px-3 py-1 text-xs font-medium" onClick={m.nextStep}>
                  {m.onboarding.step + 1 === m.onboarding.total ? t('common.done') : t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="group pointer-events-auto relative" style={{ height: size.h }}>
        <button
          type="button"
          className={clsx('absolute inset-0 touch-none select-none', movable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer')}
          aria-label={movable ? `${t('mascot.name')}. ${t('mascot.dragHint')}` : t('mascot.name')}
          title={movable ? t('mascot.dragHint') : undefined}
          onClick={() => !suppressClick.current && m.onClick()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
        {webgl && CloudCanvas ? (
          <div className={clsx('pointer-events-none transition-transform duration-150', dragging && 'scale-105')}>
            <CloudCanvas pose={pose} drift={dir} pokes={m.pokes} reducedMotion={reduced} width={size.w} height={size.h} onReady={() => setReady(true)} onFail={() => setWebgl(false)} />
          </div>
        ) : webgl === false || canvasFailed ? (
          // Без WebGL — плоское Облачко в том же состоянии (ТЗ маскота §9, резервный режим)
          <div className="pointer-events-none flex h-full items-end justify-center pb-2">
            <CloudIcon size={Math.round(size.w * 0.6)} mood={pose} className={reduced ? undefined : 'mascot-float'} />
          </div>
        ) : null}
        {(ready || webgl === false || canvasFailed || reduced) && !dragging && (
          <div className="absolute right-1 top-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Menu
              label={t('mascot.menu')}
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} aria-label={t('mascot.menu')} className="flex size-7 items-center justify-center rounded-full glass text-muted shadow-pop hover:text-fg">
                  <Ellipsis className="size-4" />
                </button>
              )}
            >
              {(close) => (
                <>
                  {userPos && (
                    <MenuItem icon={<Undo2 />} onClick={() => { close(); resetPosition(); }}>
                      {t('mascot.resetPosition')}
                    </MenuItem>
                  )}
                  <MenuItem icon={<Minimize2 />} onClick={() => { close(); m.setMode('COLLAPSED'); }}>
                    {t('mascot.collapse')}
                  </MenuItem>
                  <MenuItem icon={<EyeOff />} onClick={() => { close(); m.setMode('OFF'); }}>
                    {t('mascot.turnOff')}
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        )}
      </div>
    </div>
  );
}
