'use client';

import { Folder, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { useRefreshDrive, useErrorText } from '@/components/drive/actions';
import { KindIcon } from '@/components/drive/bits';
import { EmptyState, PageSpinner } from '@/components/drive/drive-view';
import { useMascotMood } from '@/components/mascot/mascot-context';
import { useToast } from '@/components/toast';
import { Button, IconButton, Modal } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import type { AssetCard } from '@/lib/types';

interface TrashData {
  retentionDays: number;
  folders: { type: 'folder'; id: string; name: string; deletedAt: string; purgeAt: string; files: number }[];
  assets: (AssetCard & { purgeAt: string })[];
}

/** Корзина (ТЗ §10.4): удалённое хранится N дней и восстанавливается вместе со связями */
export default function TrashPage() {
  const { t, locale, intl } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const refresh = useRefreshDrive();
  const { data, error, mutate } = useSWR<TrashData>('/trash');
  const [confirm, setConfirm] = useState<null | { kind: 'purge'; folderIds: string[]; assetIds: string[] } | { kind: 'empty' }>(null);
  const empty = data && !data.folders.length && !data.assets.length;
  // Пустая корзина — Барыс спит (ТЗ §13.2)
  useMascotMood(error ? 'confused' : empty ? 'sleep' : null, empty ? 'mascot.sleep' : undefined);

  const restore = async (folderIds: string[], assetIds: string[]) => {
    try {
      await api('/trash/restore', { method: 'POST', body: { folderIds, assetIds } });
      toast(t('trash.restored'), 'success');
      await mutate();
      void refresh();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    try {
      if (c.kind === 'empty') await api('/trash/empty', { method: 'POST' });
      else await api('/trash/purge', { method: 'POST', body: { folderIds: c.folderIds, assetIds: c.assetIds } });
      await mutate();
      void refresh();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">{t('trash.title')}</h1>
        {data && !empty && (
          <Button variant="danger" onClick={() => setConfirm({ kind: 'empty' })}>
            <Trash2 className="size-4" />
            {t('trash.emptyTrash')}
          </Button>
        )}
      </div>
      {!data && !error ? (
        <PageSpinner />
      ) : error ? (
        <EmptyState mood="confused" title={t('common.unknownError')} text={errText(error)} action={<Button onClick={() => mutate()}>{t('common.retry')}</Button>} />
      ) : empty ? (
        <EmptyState mood="sleep" title={t('trash.empty')} text={t('trash.emptyText', { days: data!.retentionDays })} />
      ) : (
        <>
          <p className="text-sm text-muted">{t('trash.emptyText', { days: data!.retentionDays })}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data!.folders.map((f) => (
              <li key={f.id} className="flex items-center gap-3 bg-surface px-3 py-2.5">
                <span className="flex size-10 items-center justify-center rounded-md bg-surface-2 text-subtle">
                  <Folder className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-xs text-muted">
                    {t('trash.filesInside', { n: f.files })} · {t('trash.purgeAt', { date: formatDate(f.purgeAt, intl) })}
                  </p>
                </div>
                <IconButton label={t('trash.restore')} onClick={() => restore([f.id], [])}>
                  <RotateCcw className="size-4" />
                </IconButton>
                <IconButton label={t('trash.deleteForever')} className="hover:text-danger" onClick={() => setConfirm({ kind: 'purge', folderIds: [f.id], assetIds: [] })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
            {data!.assets.map((a) => (
              <li key={a.id} className="flex items-center gap-3 bg-surface px-3 py-2.5">
                <span className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-subtle">
                  {a.thumbSm ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbSm} alt="" className="size-full object-cover" />
                  ) : (
                    <KindIcon kind={a.kind} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={a.name}>
                    {a.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatBytes(a.size, locale)} · {t('trash.deletedAt')} {formatDate(a.deletedAt, intl)} · {t('trash.purgeAt', { date: formatDate(a.purgeAt, intl) })}
                  </p>
                </div>
                <IconButton label={t('trash.restore')} onClick={() => restore([], [a.id])}>
                  <RotateCcw className="size-4" />
                </IconButton>
                <IconButton label={t('trash.deleteForever')} className="hover:text-danger" onClick={() => setConfirm({ kind: 'purge', folderIds: [], assetIds: [a.id] })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'empty' ? t('trash.emptyTrash') : t('trash.deleteForever')}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" data-autofocus onClick={doConfirm}>
              {t('trash.deleteForever')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirm?.kind === 'empty' ? t('trash.emptyConfirm') : t('trash.purgeConfirm')}</p>
      </Modal>
    </div>
  );
}
