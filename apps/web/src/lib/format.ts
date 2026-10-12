import type { Locale } from '@/i18n';

const UNITS: Record<Locale, string[]> = {
  ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ'],
  kk: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ'],
  en: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'],
};

/** Размер в двоичных единицах (как считает квота) */
export function formatBytes(bytes: number, locale: Locale = 'ru', digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${UNITS[locale][0]}`;
  const i = Math.min(UNITS[locale].length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  const s = v.toLocaleString(locale === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: i === 0 ? 0 : v >= 100 ? 0 : digits });
  return `${s} ${UNITS[locale][i]}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function formatDate(iso: string | null | undefined, intl: string, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(intl, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function formatEta(sec: number, locale: Locale): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const u = locale === 'en' ? { h: 'h', m: 'min', s: 's' } : locale === 'kk' ? { h: 'сағ', m: 'мин', s: 'сек' } : { h: 'ч', m: 'мин', s: 'сек' };
  if (sec >= 3600) return `${Math.floor(sec / 3600)} ${u.h} ${Math.round((sec % 3600) / 60)} ${u.m}`;
  if (sec >= 60) return `${Math.round(sec / 60)} ${u.m}`;
  return `${Math.max(1, Math.round(sec))} ${u.s}`;
}

/**
 * Метка качества строго по реальным данным (ТЗ §5, §7.2): «4K» — только если короткая сторона кадра ≥ 2160.
 */
export function qualityLabel(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  const short = Math.min(width, height);
  if (short >= 4320) return '8K';
  if (short >= 3160) return '6K';
  if (short >= 2160) return '4K';
  if (short >= 1440) return '1440p';
  if (short >= 1080) return '1080p';
  if (short >= 720) return '720p';
  return `${short}p`;
}

export function reasonKey(reason: string | null): string | null {
  if (!reason) return null;
  const code = reason.split(':')[0];
  return /^[A-Z_]+$/.test(code) ? code : null;
}

/**
 * Дата съёмки. Для фото EXIF хранит время камеры без часового пояса — показываем его как есть.
 * Для видео время создания контейнера записано в UTC — показываем в часовом поясе пользователя.
 */
export function formatTaken(a: { takenAt: string | null; kind: string }, intl: string): string {
  if (!a.takenAt) return '';
  const d = new Date(a.takenAt);
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  if (a.kind === 'PHOTO' || a.kind === 'RAW') opts.timeZone = 'UTC';
  return d.toLocaleString(intl, opts);
}

/** Мегапиксели для фото: «24 Мп» */
export function megapixels(width: number | null, height: number | null, locale: Locale): string | null {
  if (!width || !height) return null;
  const mp = (width * height) / 1e6;
  return `${mp >= 10 ? Math.round(mp) : Math.round(mp * 10) / 10} ${locale === 'en' ? 'MP' : 'Мп'}`;
}
