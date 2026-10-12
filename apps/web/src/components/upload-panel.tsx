'use client';

import clsx from 'clsx';
import { ChevronDown, ChevronUp, CircleCheck, CircleX, FolderOpen, Pause, Play, RotateCcw, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { formatBytes, formatEta } from '@/lib/format';
import type { UploadItem } from '@/lib/uploader/manager';
import { getUploadManager, useUploads } from '@/lib/uploader/react';
import { IconButton, ProgressBar, Spinner } from './ui';

export function uploadErrorText(item: UploadItem, tx: (k: string, v?: Record<string, string | number>) => string, locale: 'ru' | 'kk' | 'en') {
  const e = item.error;
  if (!e) return '';
  const vars: Record<string, string | number> = {
    max: e.details?.maxFileBytes ? formatBytes(Number(e.details.maxFileBytes), locale) : '',
    ext: String(e.details?.extension ?? item.name.split('.').pop() ?? ''),
  };
  const text = tx(`errors.${e.code}`, vars);
  return text.startsWith('errors.') ? (e.code === 'NETWORK' ? tx('common.networkError') : e.message || tx('common.unknownError')) : text;
}

export function UploadRow({ item, compact }: { item: UploadItem; compact?: boolean }) {
  const { t, tx, locale } = useI18n();
  const m = getUploadManager();
  const fileRef = useRef<HTMLInputElement>(null);
  const pct = item.size ? (item.transferred / item.size) * 100 : 0;
  const s = item.status;

  let line: string;
  switch (s) {
    case 'preparing':
      line = t('upload.hashing');
      break;
    case 'queued':
      line = t('upload.queue');
      break;
    case 'uploading':
      line = [
        t('upload.of', { a: formatBytes(item.transferred, locale), b: formatBytes(item.size, locale) }),
        item.speed > 0 ? t('upload.speed', { s: formatBytes(item.speed, locale) }) : '',
        item.eta > 0 ? t('upload.left', { t: formatEta(item.eta, locale) }) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'paused':
      line = `${t('upload.paused')} · ${t('upload.of', { a: formatBytes(item.transferred, locale), b: formatBytes(item.size, locale) })}`;
      break;
    case 'offline':
      line = t('upload.waitingNetwork');
      break;
    case 'completing':
      line = t('upload.completing');
      break;
    case 'done':
      line = `${t('upload.done')} · ${formatBytes(item.size, locale)}`;
      break;
    case 'canceled':
      line = t('upload.canceled');
      break;
    case 'needs-file':
      line = item.error ? uploadErrorText(item, tx, locale) : t('upload.needsFile');
      break;
    default:
      line = uploadErrorText(item, tx, locale);
  }

  return (
    <li className={clsx('flex flex-col gap-1.5', compact ? 'px-3 py-2.5' : 'rounded-xl glass p-3')}>
      <div className="flex items-center gap-2">
        <span className="shrink-0">
          {s === 'done' ? (
            <CircleCheck className="size-4 text-success" />
          ) : s === 'error' ? (
            <CircleX className="size-4 text-danger" />
          ) : s === 'offline' ? (
            <WifiOff className="size-4 text-warning" />
          ) : s === 'uploading' || s === 'preparing' || s === 'completing' ? (
            <Spinner className="size-4" />
          ) : (
            <span className="block size-4 rounded-full border-2 border-border-strong" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>
          {item.name}
        </span>
        <div className="flex shrink-0 items-center">
          {s === 'uploading' && (
            <IconButton label={t('upload.pause')} className="size-7" onClick={() => m.pause(item.key)}>
              <Pause className="size-3.5" />
            </IconButton>
          )}
          {(s === 'paused' || s === 'error') && item.error?.code !== 'QUOTA_EXCEEDED' && item.error?.code !== 'FILE_TOO_LARGE' && item.error?.code !== 'FORMAT_NOT_ALLOWED' && (
            <IconButton label={t('upload.resume')} className="size-7" onClick={() => void m.resume(item.key)}>
              {s === 'error' ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
            </IconButton>
          )}
          {s === 'needs-file' && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void m.attachFile(item.key, f);
                  e.target.value = '';
                }}
              />
              <IconButton label={t('upload.pickFile')} className="size-7" onClick={() => fileRef.current?.click()}>
                <FolderOpen className="size-3.5" />
              </IconButton>
            </>
          )}
          {['queued', 'preparing', 'uploading', 'paused', 'offline', 'needs-file', 'error'].includes(s) && (
            <IconButton label={t('upload.cancel')} className="size-7" onClick={() => void m.cancel(item.key)}>
              <X className="size-3.5" />
            </IconButton>
          )}
          {(s === 'done' || s === 'canceled') && (
            <IconButton label={t('upload.remove')} className="size-7" onClick={() => m.dismiss(item.key)}>
              <X className="size-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      {s !== 'done' && s !== 'canceled' && s !== 'needs-file' && (
        <ProgressBar value={pct} tone={s === 'error' ? 'danger' : s === 'paused' || s === 'offline' ? 'warning' : 'accent'} label={item.name} />
      )}
      <p className={clsx('text-xs', s === 'error' || (s === 'needs-file' && item.error) ? 'text-danger' : 'text-muted')}>{line}</p>
    </li>
  );
}

/** Очередь загрузок в углу экрана — видна при переходах между страницами (ТЗ §5, §12) */
export function UploadPanel() {
  const items = useUploads();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const finished = items.length > 0 && items.every((i) => i.status === 'done' || i.status === 'canceled');
  useEffect(() => {
    if (!finished) {
      setCollapsed(false);
      return;
    }
    const id = setTimeout(() => setCollapsed(true), 6000);
    return () => clearTimeout(id);
  }, [finished]);
  const visible = items.filter((i) => i.status !== 'canceled');
  if (!visible.length) return null;
  const active = visible.filter((i) => !['done', 'error', 'needs-file'].includes(i.status));
  const total = active.reduce((a, i) => a + i.size, 0);
  const sent = active.reduce((a, i) => a + i.transferred, 0);
  const allDone = visible.length > 0 && visible.every((i) => i.status === 'done');

  return (
    <section
      data-mascot-avoid
      aria-label={t('upload.queue')}
      className="fixed bottom-0 right-0 z-30 w-full overflow-hidden glass-strong sm:bottom-4 sm:right-4 sm:w-96 sm:rounded-2xl"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{allDone ? t('upload.allDone') : `${t('upload.uploading')}: ${active.length}`}</p>
          {!allDone && total > 0 && <ProgressBar className="mt-1.5" value={(sent / total) * 100} label={t('upload.queue')} />}
        </div>
        <IconButton label={collapsed ? t('upload.expand') : t('upload.collapse')} className="size-8" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </IconButton>
        {allDone && (
          <IconButton label={t('common.close')} className="size-8" onClick={() => getUploadManager().clearFinished()}>
            <X className="size-4" />
          </IconButton>
        )}
      </header>
      {!collapsed && <ul className="scrollbar-thin max-h-80 divide-y divide-border overflow-y-auto">{visible.map((i) => <UploadRow key={i.key} item={i} compact />)}</ul>}
    </section>
  );
}
