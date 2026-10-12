'use client';

import clsx from 'clsx';
import { ChevronRight, Folder, HardDrive } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import type { AssetCard, FolderItem } from '@/lib/types';
import { useToast } from '../toast';
import { Button, Input, Modal, Spinner } from '../ui';
import { useReason } from './bits';

/** Обновить все списки, где мог измениться объект */
export function useRefreshDrive() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => mutate((key) => typeof key === 'string' && /^\/(drive|search|trash|assets|me)/.test(key)),
    [mutate],
  );
}

export function useErrorText() {
  const { tx, t } = useI18n();
  return (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.code === 'NETWORK') return t('common.networkError');
      const v = tx(`errors.${e.code}`);
      return v.startsWith('errors.') ? e.message || t('common.unknownError') : v;
    }
    return t('common.unknownError');
  };
}

/** «Скачать оригинал»: ссылка выдаётся после проверки прав и состояния, отдаётся именно исходный файл */
export function useDownload() {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const reason = useReason();
  return useCallback(
    async (asset: Pick<AssetCard, 'id' | 'state' | 'stateReason'>) => {
      let ack = false;
      if (asset.state === 'RESTRICTED') {
        ack = window.confirm(t('file.restrictedConfirm', { reason: reason(asset.stateReason) }));
        if (!ack) return;
      }
      try {
        const r = await api<{ url: string }>(`/assets/${asset.id}/download`, { method: 'POST', body: { acknowledgeUnverified: ack } });
        const a = document.createElement('a');
        a.href = r.url;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(t('file.downloadStarted'), 'success');
      } catch (e) {
        toast(errText(e), 'error');
      }
    },
    [t, toast, errText, reason],
  );
}

export function NameDialog({ open, title, initial, label, onClose, onSubmit }: { open: boolean; title: string; initial: string; label: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setValue(initial);
      setError(null);
    }
  }
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!value.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input label={label} value={value} onChange={(e) => setValue(e.target.value)} maxLength={255} error={error} onFocus={(e) => {
          // Выделяем имя без расширения
          const dot = e.target.value.lastIndexOf('.');
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }} />
      </form>
    </Modal>
  );
}

/** Выбор папки назначения: дерево папок пользователя */
export function MoveDialog({ open, onClose, onMove, excludeIds = [] }: { open: boolean; onClose: () => void; onMove: (folderId: string | null) => Promise<void>; excludeIds?: string[] }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const { data } = useSWR<{ folders: Pick<FolderItem, 'id' | 'name' | 'parentId'>[] }>(open ? '/drive/tree' : null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => {
    const byParent = new Map<string | null, Pick<FolderItem, 'id' | 'name' | 'parentId'>[]>();
    for (const f of data?.folders ?? []) {
      const list = byParent.get(f.parentId) ?? [];
      list.push(f);
      byParent.set(f.parentId, list);
    }
    const rows: { id: string; name: string; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const f of byParent.get(parent) ?? []) {
        // Папку нельзя переместить в неё саму или в её вложенные
        if (excludeIds.includes(f.id)) continue;
        rows.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }, [data, excludeIds]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onMove(target);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('drive.moveTo')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {t('drive.moveHere')}
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label={t('drive.moveTo')}>
          <li>
            <button type="button" role="option" aria-selected={target === null} onClick={() => setTarget(null)} className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm', target === null ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2')}>
              <HardDrive className="size-4" />
              {t('common.root')}
            </button>
          </li>
          {tree.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={target === f.id}
                onClick={() => setTarget(f.id)}
                className={clsx('flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm', target === f.id ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2')}
                style={{ paddingLeft: 8 + (f.depth + 1) * 16 }}
              >
                {f.depth > 0 && <ChevronRight className="size-3 text-subtle" />}
                <Folder className="size-4" />
                <span className="truncate" title={f.name}>
                  {f.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
