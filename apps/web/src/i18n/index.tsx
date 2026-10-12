'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { kk } from './kk';
import { ru, type Dict } from './ru';

export type Locale = 'ru' | 'kk' | 'en';
export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'kk', label: 'Қазақша', short: 'KZ' },
  { code: 'en', label: 'English', short: 'EN' },
];
const DICTS: Record<Locale, Dict> = { ru, kk, en };

type Leaf = string | string[];
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Paths<Dict>;

/** Поиск по пути; ключи с точкой внутри (например, «upload.partSizeMb» в настройках) тоже находятся */
function lookup(dict: unknown, key: string): unknown {
  if (!dict || typeof dict !== 'object') return undefined;
  const obj = dict as Record<string, unknown>;
  if (key in obj) return obj[key];
  const parts = key.split('.');
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join('.');
    if (head in obj) {
      const found = lookup(obj[head], parts.slice(i).join('.'));
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function translate(locale: Locale, key: TKey | string, vars?: Record<string, string | number>): string {
  const v = lookup(DICTS[locale], key) ?? lookup(ru, key);
  if (typeof v !== 'string') return key;
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : v;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  /** Для ключей, собранных динамически (коды ошибок, состояния) */
  tx: (key: string, vars?: Record<string, string | number>) => string;
  list: (key: TKey) => string[];
  intl: string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, setLocale, children }: { locale: Locale; setLocale: (l: Locale) => void; children: ReactNode }) {
  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  const tx = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  const list = useCallback((key: TKey) => {
    const v = lookup(DICTS[locale], key);
    return Array.isArray(v) ? v : [];
  }, [locale]);
  const value = useMemo(
    () => ({ locale, setLocale, t, tx, list, intl: locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU' }),
    [locale, setLocale, t, tx, list],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n вне I18nProvider');
  return v;
}

export const isLocale = (v: unknown): v is Locale => v === 'ru' || v === 'kk' || v === 'en';
