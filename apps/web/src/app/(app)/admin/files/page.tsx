'use client';

import clsx from 'clsx';
import { useState } from 'react';
import useSWR from 'swr';
import { useErrorText } from '@/components/drive/actions';
import { useReason } from '@/components/drive/bits';
import { PageSpinner } from '@/components/drive/drive-view';
import { useSession } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';

interface AdminAsset {
  id: string;
  name: string;
  kind: string;
  size: number;
  state: string;
  stateReason: string | null;
  processing: string;
  processingError: string | null;
  processingAttempts: number;
  stateChangedAt: string;
  owner: { email: string };
}

/** Файлы «Ограничен» / «Заблокирован» и ошибки обработки — только метаданные, без содержимого (ТЗ §15) */
export default function AdminFiles() {
  const { t, locale, intl } = useI18n();
  const { user } = useSession();
  const toast = useToast();
  const errText = useErrorText();
  const reason = useReason();
  const [filter, setFilter] = useState<'restricted' | 'blocked' | 'failed'>('restricted');
  const { data, mutate } = useSWR<{ items: AdminAsset[] }>(`/admin/assets?filter=${filter}`);
  const canModerate = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const canProcess = user?.role === 'ADMIN' || user?.role === 'SUPPORT';

  const act = async (id: string, action: 'rescan' | 'reprocess' | 'block' | 'unblock') => {
    let why: string | undefined;
    if (action === 'block') {
      why = window.prompt(t('admin.reports.resolution')) ?? undefined;
      if (!why) return;
    }
    try {
      await api(`/admin/assets/${id}/action`, { method: 'POST', body: { action, reason: why } });
      toast(t('common.done'), 'success');
      await mutate();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 self-start rounded-lg border border-border p-0.5">
        {(['restricted', 'blocked', 'failed'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={clsx('rounded-md px-3 py-1 text-sm', filter === f ? 'bg-surface-3' : 'text-muted')}>
            {t(`admin.files.${f}`)}
          </button>
        ))}
      </div>
      {!data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <p className="py-10 text-center text-muted">{t('admin.files.empty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={a.name}>
                  {a.name}
                </p>
                <p className="text-xs text-muted">
                  {a.owner.email} · {formatBytes(a.size, locale)} · {formatDate(a.stateChangedAt, intl, true)}
                </p>
                <p className="mt-1 text-xs text-warning">{filter === 'failed' ? a.processingError : reason(a.stateReason)}</p>
                {filter === 'failed' && <p className="text-xs text-subtle">{t('admin.files.attempts', { n: a.processingAttempts })}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {canProcess && filter !== 'blocked' && (
                  <Button size="sm" onClick={() => act(a.id, filter === 'failed' ? 'reprocess' : 'rescan')}>
                    {filter === 'failed' ? t('admin.files.reprocess') : t('admin.files.rescan')}
                  </Button>
                )}
                {canModerate && (filter === 'blocked' ? (
                  <Button size="sm" onClick={() => act(a.id, 'unblock')}>{t('admin.files.unblock')}</Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => act(a.id, 'block')}>{t('admin.files.block')}</Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
