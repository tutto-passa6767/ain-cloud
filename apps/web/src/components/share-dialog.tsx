'use client';

import clsx from 'clsx';
import { Copy, Lock, Link as LinkIcon, Ban } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useErrorText } from './drive/actions';
import { useSession } from './providers';
import { useToast } from './toast';
import { Badge, Button, Input, Modal, Spinner } from './ui';

interface Share {
  id: string;
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  viewOnly: boolean;
  opens: number;
  downloadsIssued: number;
  revokedAt: string | null;
  blockedAt: string | null;
  createdAt: string;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Ссылка на файл или папку (ТЗ §9): на Free — простая, на Pro — пароль, срок, лимит, «только просмотр», отзыв */
export function ShareDialog({ target, onClose }: { target: { assetId?: string; folderId?: string; name: string } | null; onClose: () => void }) {
  const { t, intl } = useI18n();
  const { me } = useSession();
  const toast = useToast();
  const errText = useErrorText();
  const pro = !!me?.plan?.features?.passwordLinks;
  const key = target ? `/shares?${new URLSearchParams(target.assetId ? { assetId: target.assetId } : { folderId: target.folderId! })}` : null;
  const { data, mutate } = useSWR<{ items: Share[] }>(key);
  const [opts, setOpts] = useState({ password: '', expiresAt: '', maxDownloads: '', viewOnly: false });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = target.assetId ? { assetId: target.assetId } : { folderId: target.folderId };
      if (pro) {
        if (opts.password) body.password = opts.password;
        if (opts.expiresAt) body.expiresAt = new Date(`${opts.expiresAt}T23:59:59`).toISOString();
        if (opts.maxDownloads) body.maxDownloads = Number(opts.maxDownloads);
        if (opts.viewOnly) body.viewOnly = true;
      }
      const s = await api<Share>('/shares', { method: 'POST', body });
      await copy(s.url);
      toast(t('share.created'), 'success');
      setOpts({ password: '', expiresAt: '', maxDownloads: '', viewOnly: false });
      await mutate();
    } catch (e) {
      toast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = (s: Share) => {
    if (s.blockedAt) return <Badge tone="danger">{t('share.blocked')}</Badge>;
    if (s.revokedAt) return <Badge>{t('share.revoked')}</Badge>;
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) return <Badge>{t('share.expired')}</Badge>;
    return null;
  };

  return (
    <Modal open={!!target} onClose={onClose} title={`${t('share.title')}: ${target?.name ?? ''}`} wide>
      <div className="flex flex-col gap-5">
        <section className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-medium">{t('share.options')}</p>
          <div className={clsx('grid gap-3 sm:grid-cols-3', !pro && 'pointer-events-none opacity-50')} aria-disabled={!pro}>
            <Input label={t('share.password')} type="password" autoComplete="new-password" value={opts.password} onChange={(e) => setOpts((o) => ({ ...o, password: e.target.value }))} disabled={!pro} />
            <Input label={t('share.expiresAt')} type="date" value={opts.expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setOpts((o) => ({ ...o, expiresAt: e.target.value }))} disabled={!pro} />
            <Input label={t('share.maxDownloads')} type="number" min={1} value={opts.maxDownloads} onChange={(e) => setOpts((o) => ({ ...o, maxDownloads: e.target.value }))} disabled={!pro} />
          </div>
          <label className={clsx('mt-3 flex items-center gap-2 text-sm', !pro && 'opacity-50')}>
            <input type="checkbox" checked={opts.viewOnly} disabled={!pro} onChange={(e) => setOpts((o) => ({ ...o, viewOnly: e.target.checked }))} className="size-4" />
            {t('share.viewOnly')}
          </label>
          {!pro && <p className="mt-3 text-xs text-warning">{t('share.proOnly')}</p>}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={busy} onClick={create}>
              <LinkIcon className="size-4" />
              {t('share.create')}
            </Button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-sm font-medium">{t('share.links')}</p>
          {!data ? (
            <Spinner />
          ) : data.items.length === 0 ? (
            <p className="text-sm text-muted">{t('share.noLinks')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.items.map((s) => {
                const inactive = !!s.revokedAt || !!s.blockedAt || (!!s.expiresAt && new Date(s.expiresAt) < new Date());
                return (
                  <li key={s.id} className={clsx('rounded-xl border border-border p-3', inactive && 'opacity-60')}>
                    <div className="flex items-center gap-2">
                      <input readOnly value={s.url} aria-label={t('share.copy')} className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated px-2 font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <Button size="sm" disabled={inactive} onClick={async () => (await copy(s.url)) && toast(t('common.copied'), 'success')}>
                        <Copy className="size-3.5" />
                        {t('share.copy')}
                      </Button>
                      {!s.revokedAt && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await api(`/shares/${s.id}`, { method: 'DELETE' }).catch((e) => toast(errText(e), 'error'));
                            await mutate();
                          }}
                        >
                          <Ban className="size-3.5" />
                          {t('share.revoke')}
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {status(s)}
                      {s.hasPassword && (
                        <Badge>
                          <Lock className="size-3" />
                          {t('share.password')}
                        </Badge>
                      )}
                      {s.viewOnly && <Badge>{t('publicLink.viewOnly')}</Badge>}
                      {s.expiresAt && <Badge>{`${t('share.expiresAt')} ${formatDate(s.expiresAt, intl)}`}</Badge>}
                      {s.maxDownloads !== null && <Badge>{`${t('share.maxDownloads')}: ${s.maxDownloads}`}</Badge>}
                      <span>{t('share.stats', { opens: s.opens, downloads: s.downloadsIssued })}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            {t('share.statsNote')} {t('share.revokeNote')} {t('share.viewOnlyNote')}
          </p>
        </section>
      </div>
    </Modal>
  );
}
