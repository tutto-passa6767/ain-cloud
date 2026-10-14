'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, type TKey } from '@/i18n';
import type { MascotMode } from '@/lib/types';
import { useSession } from '../providers';
import type { CloudPose } from './cloud-model';

export type Mood = CloudPose;

/** Приоритет состояний (ТЗ маскота §6): Злой > Растерян > Радость > Думает > Привет > Ожидание > Спит */
const PRIORITY: Mood[] = ['angry', 'confused', 'happy', 'think', 'hello', 'idle', 'sleep'];
const rank = (m: Mood) => PRIORITY.indexOf(m);

export interface Bubble {
  text: string;
  /** Важная реплика (ошибка): не исчезает сама, пока ситуация не решится */
  urgent: boolean;
  source?: string;
}

interface MascotApi {
  mode: MascotMode;
  mood: Mood;
  /** В онбординге Облачко крупнее и стоит рядом с основным содержимым (ТЗ маскота §6) */
  large: boolean;
  bubble: Bubble | null;
  dismissBubble: () => void;
  /** Счётчик нажатий — для реакции «тык» */
  pokes: number;
  onboarding: { step: number; total: number; text: string } | null;
  nextStep: () => void;
  finishOnboarding: () => void;
  onClick: () => void;
  setMode: (m: MascotMode) => void;
  /** Состояние, которое держится, пока источник его не снимет (страница, очередь загрузок) */
  setPageMood: (id: string, mood: Mood | null, text?: string, urgent?: boolean) => void;
  /** Кратковременное состояние: «Радость» держится 4 с, затем возврат к прежнему */
  react: (mood: Mood, ms?: number, text?: string) => void;
  // Программный интерфейс модуля из ТЗ маскота §8.2
  setState: (mood: Mood, data?: { text?: string; ttl?: number }) => void;
  /** updateOnly — только обновить текст уже показанной реплики того же источника (процент загрузки) */
  say: (text: string, opts?: { ttl?: number; urgent?: boolean; source?: string; updateOnly?: boolean }) => void;
  poke: () => void;
  hide: () => void;
  show: () => void;
  setEnabled: (on: boolean) => void;
}

const MascotContext = createContext<MascotApi | null>(null);

/** Не чаще одной несрочной подсказки за 5 минут (ТЗ маскота §6) */
const HINT_INTERVAL_MS = 5 * 60_000;
/** Бездействие 2+ минуты — «Спит» (ТЗ маскота §8.1) */
const IDLE_SLEEP_MS = 2 * 60_000;
/** Реплика исчезает через 5 секунд (ТЗ маскота §5) */
const BUBBLE_MS = 5000;
const TOUR: TKey[] = ['mascot.tour1', 'mascot.tour2', 'mascot.tour3', 'mascot.tour4'];

const readNum = (k: string) => {
  try {
    return Number(localStorage.getItem(k) ?? 0);
  } catch {
    return 0;
  }
};
const writeNum = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* приватный режим */
  }
};

export function MascotProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useSession();
  const { t, list } = useI18n();
  const [anonMode, setAnonMode] = useState<MascotMode>('ON');
  const mode: MascotMode = user ? user.mascotMode : anonMode;

  const [pageMoods, setPageMoods] = useState<{ id: string; mood: Mood }[]>([]);
  const [transient, setTransient] = useState<{ mood: Mood; until: number } | null>(null);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [pokes, setPokes] = useState(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickIdx = useRef(0);

  const say = useCallback((text: string, opts: { ttl?: number; urgent?: boolean; source?: string; updateOnly?: boolean } = {}) => {
    const urgent = !!opts.urgent;
    setBubble((cur) => {
      // Обновление текста той же реплики (например, процента загрузки) не продлевает её показ
      if (opts.updateOnly) return cur && cur.source === opts.source && !cur.urgent ? (cur.text === text ? cur : { ...cur, text }) : cur;
      if (cur && opts.source && cur.source === opts.source && !urgent && !cur.urgent) return { ...cur, text };
      clearTimeout(bubbleTimer.current);
      if (!urgent) bubbleTimer.current = setTimeout(() => setBubble(null), opts.ttl ?? BUBBLE_MS);
      return { text, urgent, source: opts.source };
    });
  }, []);

  const hint = useCallback(
    (text: string) => {
      const last = readNum('ain-mascot-hint-at');
      if (Date.now() - last < HINT_INTERVAL_MS) return;
      writeNum('ain-mascot-hint-at', Date.now());
      say(text);
    },
    [say],
  );

  const setPageMood = useCallback(
    (id: string, mood: Mood | null, text?: string, urgent?: boolean) => {
      setPageMoods((cur) => {
        const rest = cur.filter((x) => x.id !== id);
        return mood ? [...rest, { id, mood }] : rest;
      });
      // Важная реплика уходит, когда её источник снял состояние
      if (!mood || !urgent) setBubble((b) => (b?.urgent && b.source === id ? null : b));
      if (mood && text) {
        if (urgent) say(text, { urgent: true, source: id });
        else hint(text);
      }
    },
    [say, hint],
  );

  const react = useCallback(
    (mood: Mood, ms = 4000, text?: string) => {
      setTransient({ mood, until: Date.now() + ms });
      if (text) say(text, { ttl: Math.max(ms, BUBBLE_MS) });
    },
    [say],
  );

  useEffect(() => {
    if (!transient) return;
    const id = setTimeout(() => setTransient(null), Math.max(0, transient.until - Date.now()));
    return () => clearTimeout(id);
  }, [transient]);

  // Бездействие → «Спит»; любое действие будит
  useEffect(() => {
    let timer = setTimeout(() => setSleeping(true), IDLE_SLEEP_MS);
    const wake = () => {
      setSleeping(false);
      clearTimeout(timer);
      timer = setTimeout(() => setSleeping(true), IDLE_SLEEP_MS);
    };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(timer);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  // Онбординг при первом входе: «Привет» и тур по шагам
  useEffect(() => {
    if (user && !user.onboardedAt && user.mascotMode === 'ON' && user.emailVerifiedAt) setTourStep((s) => s ?? 0);
  }, [user]);

  const finishOnboarding = useCallback(() => {
    setTourStep(null);
    if (user && !user.onboardedAt) void updateUser({ onboarded: true }).catch(() => undefined);
  }, [user, updateUser]);

  const nextStep = useCallback(() => {
    setTourStep((s) => {
      if (s === null) return s;
      if (s + 1 >= TOUR.length) {
        queueMicrotask(finishOnboarding);
        return s;
      }
      return s + 1;
    });
  }, [finishOnboarding]);

  const setMode = useCallback(
    (m: MascotMode) => {
      if (user) void updateUser({ mascotMode: m }).catch(() => undefined);
      else setAnonMode(m);
      // Возвращается с приветствием (ТЗ маскота §7, вариант 2)
      if (m === 'ON') react('hello', 3200, t('mascot.hello'));
      if (m !== 'ON') setTourStep(null);
    },
    [user, updateUser, react, t],
  );

  const poke = useCallback(() => setPokes((n) => n + 1), []);

  const onClick = useCallback(() => {
    poke();
    // По нажатию — текущая реплика, если она есть, иначе короткая фраза
    if (bubble) return;
    const phrases = list('mascot.click');
    say(phrases[clickIdx.current++ % Math.max(1, phrases.length)]);
  }, [poke, bubble, list, say]);

  const onboarding = useMemo(() => (tourStep !== null ? { step: tourStep, total: TOUR.length, text: t(TOUR[tourStep]) } : null), [tourStep, t]);

  const mood: Mood = useMemo(() => {
    const candidates: Mood[] = [...pageMoods.map((p) => p.mood)];
    if (onboarding) candidates.push('hello');
    if (transient) candidates.push(transient.mood);
    if (!candidates.length) return sleeping ? 'sleep' : 'idle';
    return candidates.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  }, [pageMoods, onboarding, transient, sleeping]);

  const value = useMemo<MascotApi>(
    () => ({
      mode,
      mood,
      large: !!onboarding,
      bubble: onboarding ? { text: onboarding.text, urgent: false } : bubble,
      dismissBubble: () => setBubble(null),
      pokes,
      onboarding,
      nextStep,
      finishOnboarding,
      onClick,
      setMode,
      setPageMood,
      react,
      setState: (m, data) => react(m, data?.ttl ?? 4000, data?.text),
      say,
      poke,
      hide: () => setMode('COLLAPSED'),
      show: () => setMode('ON'),
      setEnabled: (on) => setMode(on ? 'ON' : 'OFF'),
    }),
    [mode, mood, onboarding, bubble, pokes, nextStep, finishOnboarding, onClick, setMode, setPageMood, react, say, poke],
  );

  return <MascotContext.Provider value={value}>{children}</MascotContext.Provider>;
}

export function useMascot(): MascotApi {
  const v = useContext(MascotContext);
  if (!v) throw new Error('useMascot вне MascotProvider');
  return v;
}

/** Без исключения вне провайдера — для компонентов, которые бывают и на публичных страницах */
export function useMascotOptional(): MascotApi | null {
  return useContext(MascotContext);
}

/**
 * Страница задаёт состояние маскота на время показа (снимается при уходе со страницы).
 * hint — несрочная подсказка (не чаще раза в 5 минут); urgent — важная реплика, висит, пока состояние не снято.
 */
export function useMascotMood(mood: Mood | null, hint?: TKey, opts: { vars?: Record<string, string | number>; urgent?: boolean } = {}) {
  const ctx = useContext(MascotContext);
  const { t } = useI18n();
  const id = useId();
  const setPageMood = ctx?.setPageMood;
  const text = hint ? t(hint, opts.vars) : undefined;
  const urgent = !!opts.urgent;
  useEffect(() => {
    if (!setPageMood) return;
    setPageMood(id, mood, text, urgent);
    return () => setPageMood(id, null);
  }, [setPageMood, id, mood, text, urgent]);
}
