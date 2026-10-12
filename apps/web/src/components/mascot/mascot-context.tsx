'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, type TKey } from '@/i18n';
import type { MascotMode } from '@/lib/types';
import { useSession } from '../providers';
import type { BarysPose } from './barys-model';

export type Mood = BarysPose;

interface MascotApi {
  mode: MascotMode;
  setMode: (m: MascotMode) => void;
  mood: Mood;
  /** Подставка видна только в онбординге */
  pedestal: boolean;
  bubble: string | null;
  dismissBubble: () => void;
  setPageMood: (id: string, mood: Mood | null, hint?: TKey) => void;
  react: (mood: Mood, ms?: number, text?: string) => void;
  onboarding: { step: number; total: number; text: string } | null;
  nextStep: () => void;
  finishOnboarding: () => void;
  onClick: () => void;
}

const MascotContext = createContext<MascotApi | null>(null);

/** Не больше одной подсказки за 5 минут (ТЗ §13.3) */
const HINT_INTERVAL_MS = 5 * 60_000;
/** «Спит» при долгом бездействии (ТЗ §13.2) */
const IDLE_SLEEP_MS = 3 * 60_000;
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
  const [bubble, setBubble] = useState<string | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickIdx = useRef(0);

  const showBubble = useCallback((text: string, ms = 6000) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  const hint = useCallback(
    (text: string) => {
      const last = readNum('ain-mascot-hint-at');
      if (Date.now() - last < HINT_INTERVAL_MS) return;
      writeNum('ain-mascot-hint-at', Date.now());
      showBubble(text);
    },
    [showBubble],
  );

  const setPageMood = useCallback(
    (id: string, mood: Mood | null, hintKey?: TKey) => {
      setPageMoods((cur) => {
        const rest = cur.filter((x) => x.id !== id);
        return mood ? [...rest, { id, mood }] : rest;
      });
      if (mood && hintKey) hint(t(hintKey));
    },
    [hint, t],
  );

  const react = useCallback(
    (mood: Mood, ms = 4000, text?: string) => {
      setTransient({ mood, until: Date.now() + ms });
      if (text) showBubble(text, Math.max(ms, 4000));
    },
    [showBubble],
  );

  useEffect(() => {
    if (!transient) return;
    const id = setTimeout(() => setTransient(null), Math.max(0, transient.until - Date.now()));
    return () => clearTimeout(id);
  }, [transient]);

  // Долгое бездействие → «Спит»; любое действие будит
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

  // Онбординг при первом входе: Барыс на подставке машет лапой и ведёт по шагам тура
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
      if (m === 'ON') react('wave', 3500, t('mascot.hello'));
      if (m !== 'ON') setTourStep(null);
    },
    [user, updateUser, react, t],
  );

  const onClick = useCallback(() => {
    const phrases = list('mascot.click');
    const text = phrases[clickIdx.current++ % Math.max(1, phrases.length)];
    react('happy', 1600, text);
  }, [list, react]);

  const onboarding = tourStep !== null ? { step: tourStep, total: TOUR.length, text: t(TOUR[tourStep]) } : null;
  const mood: Mood = onboarding
    ? 'wave'
    : transient?.mood ?? (sleeping ? 'sleep' : pageMoods[pageMoods.length - 1]?.mood ?? 'idle');

  const value = useMemo<MascotApi>(
    () => ({
      mode,
      setMode,
      mood,
      pedestal: !!onboarding,
      bubble: onboarding ? onboarding.text : bubble,
      dismissBubble: () => setBubble(null),
      setPageMood,
      react,
      onboarding,
      nextStep,
      finishOnboarding,
      onClick,
    }),
    [mode, setMode, mood, onboarding, bubble, setPageMood, react, nextStep, finishOnboarding, onClick],
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

/** Страница задаёт состояние маскота на время показа (снимается при уходе со страницы) */
export function useMascotMood(mood: Mood | null, hint?: TKey) {
  const ctx = useContext(MascotContext);
  const id = useRef(`m${Math.random().toString(36).slice(2)}`);
  const setPageMood = ctx?.setPageMood;
  useEffect(() => {
    if (!setPageMood) return;
    setPageMood(id.current, mood, hint);
    return () => setPageMood(id.current, null);
  }, [setPageMood, mood, hint]);
}
