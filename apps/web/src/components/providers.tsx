'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { I18nProvider, isLocale, type Locale } from '@/i18n';
import { api, ApiError, fetcher } from '@/lib/api';
import type { Me, User } from '@/lib/types';
import { getUploadManager } from '@/lib/uploader/react';
import { ToastProvider } from './toast';

interface SessionValue {
  me: Me | undefined;
  user: User | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  updateUser: (patch: Partial<Pick<User, 'name' | 'locale' | 'theme' | 'mascotMode'>> & { onboarded?: boolean }) => Promise<void>;
  theme: 'DARK' | 'LIGHT';
  setTheme: (t: 'DARK' | 'LIGHT') => void;
}

const SessionContext = createContext<SessionValue | null>(null);

// Тема и язык дублируются в localStorage только как удобство для первого кадра;
// источник истины — аккаунт пользователя на сервере.
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLocal = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* приватный режим */
  }
};

function Inner({ children }: { children: ReactNode }) {
  const { data: me, isLoading, mutate } = useSWR<Me>('/me', fetcher, { revalidateOnFocus: true, shouldRetryOnError: false });
  const user = me?.user ?? null;

  const [localeState, setLocaleState] = useState<Locale>('ru');
  const [themeState, setThemeState] = useState<'DARK' | 'LIGHT'>('DARK');

  useEffect(() => {
    const l = readLocal('ain-locale');
    if (isLocale(l)) setLocaleState(l);
    else if (navigator.language.startsWith('kk')) setLocaleState('kk');
    else if (navigator.language.startsWith('en')) setLocaleState('en');
    const t = readLocal('ain-theme');
    if (t === 'LIGHT' || t === 'DARK') setThemeState(t);
  }, []);

  // Настройки аккаунта имеют приоритет и действуют на всех устройствах
  useEffect(() => {
    if (!user) return;
    if (isLocale(user.locale)) setLocaleState(user.locale);
    setThemeState(user.theme);
    writeLocal('ain-locale', user.locale);
    writeLocal('ain-theme', user.theme);
  }, [user?.locale, user?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.lang = localeState === 'kk' ? 'kk' : localeState;
  }, [localeState]);
  useEffect(() => {
    document.documentElement.classList.toggle('light', themeState === 'LIGHT');
  }, [themeState]);

  // Подсветка под курсором на стеклянных карточках: координаты пишутся в CSS-переменные элемента
  useEffect(() => {
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const el = (e.target as Element | null)?.closest?.('.spotlight') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (me?.upload?.parallelParts) getUploadManager().parallelParts = me.upload.parallelParts;
  }, [me?.upload?.parallelParts]);

  const updateUser = useCallback<SessionValue['updateUser']>(
    async (patch) => {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: patch });
      await mutate((cur) => (cur ? { ...cur, user: r.user } : cur), { revalidate: false });
    },
    [mutate],
  );

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      writeLocal('ain-locale', l);
      if (user) void updateUser({ locale: l }).catch(() => undefined);
    },
    [user, updateUser],
  );

  const setTheme = useCallback(
    (t: 'DARK' | 'LIGHT') => {
      setThemeState(t);
      writeLocal('ain-theme', t);
      if (user) void updateUser({ theme: t }).catch(() => undefined);
    },
    [user, updateUser],
  );

  const value = useMemo<SessionValue>(
    () => ({ me, user, loading: isLoading, refresh: () => mutate(), updateUser, theme: themeState, setTheme }),
    [me, user, isLoading, mutate, updateUser, themeState, setTheme],
  );

  return (
    <SessionContext.Provider value={value}>
      <I18nProvider locale={localeState} setLocale={setLocale}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </SessionContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        onErrorRetry: (err, _key, _cfg, revalidate, { retryCount }) => {
          // Ошибки доступа и «не найдено» не повторяем
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), 2000 * (retryCount + 1));
        },
      }}
    >
      <Inner>{children}</Inner>
    </SWRConfig>
  );
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession вне Providers');
  return v;
}
