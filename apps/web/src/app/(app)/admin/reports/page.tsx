'use client';

import clsx from 'clsx';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { useErrorText } from '@/components/drive/actions';
import { PageSpinner } from '@/components/drive/drive-view';
import { useToast } from '@/components/toast';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';

interface Report {
  id: string;
  reason: string;
  text: string;
  status: string;
  createdAt: string;
  resolution: string | null;
  assetId: string | null;
  asset: { id: string; name: string; kind: string; size: number; state: string; owner: { email: string } } | null;
  share: { id: string; token: string; blockedAt: string | null; revokedAt: string | null } | null;
}

/** Очередь жалоб модераторов (ТЗ §10.2, §15) */
export default function AdminReports() {
  const { t, tx, locale, intl } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | 'REJECTED'>('OPEN');
  const { data, mutate } = useSWR<{ items: Report[] }>(`/admin/reports?status=${status}`);
  const [active, setActive] = useState<Report | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const resolve = async (action: 'block_asset' | 'block_share' | 'reject') => {
    if (!active) return;
    try {
      await api(`/admin/reports/${active.id}/resolve`, { method: 'POST', body: { action, reason } });
      setActive(null);
      setPreview(null);
      setReason('');
      await mutate();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 self-start rounded-lg border border-border p-0.5">
        {(['OPEN', 'RESOLVED', 'REJECTED'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={clsx('rounded-md px-3 py-1 text-sm', status === s ? 'bg-surface-3' : 'text-muted')}>
            {t(`admin.reports.${s.toLowerCase() as 'open' | 'resolved' | 'rejected'}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{t('admin.reports.accessNote')}</p>
      {!data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <p className="py-10 text-center text-muted">{t('admin.reports.empty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.asset?.name ?? '—'}</p>
                <p className="text-xs text-muted">
                  {tx(`publicLink.reasons.${r.reason}`)} · {r.asset ? `${r.asset.owner.email} · ${formatBytes(r.asset.size, locale)} · ` : ''}
                  {formatDate(r.createdAt, intl, true)}
                </p>
                {r.text && <p className="mt-1 text-sm">«{r.text}»</p>}
                {r.resolution && <p className="mt-1 text-xs text-subtle">{r.resolution}</p>}
              </div>
              {r.asset?.state === 'BLOCKED' && <Badge tone="danger">{t('state.BLOCKED')}</Badge>}
              {r.share?.blockedAt && <Badge tone="danger">{t('share.blocked')}</Badge>}
              {status === 'OPEN' && (
                <Button size="sm" onClick={() => setActive(r)}>
                  {t('common.open')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!active} onClose={() => { setActive(null); setPreview(null); }} title={active?.asset?.name ?? ''} wide>
        {active && (
          <div className="flex flex-col gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-80 w-full rounded-lg bg-black object-contain" />
            ) : (
              <Button
                onClick={async () => {
                  try {
                    const r = await api<{ url: string | null }>(`/admin/reports/${active.id}/preview`);
                    setPreview(r.url);
                  } catch (e) {
                    toast(errText(e), 'error');
                  }
                }}
              >
                <Eye className="size-4" />
                {t('admin.reports.preview')}
              </Button>
            )}
            <Input label={t('admin.reports.resolution')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={!reason.trim() || !active.assetId} onClick={() => resolve('block_asset')}>
                {t('admin.reports.blockFile')}
              </Button>
              <Button variant="danger" disabled={!reason.trim() || !active.share} onClick={() => resolve('block_share')}>
                {t('admin.reports.blockLink')}
              </Button>
              <Button disabled={!reason.trim()} onClick={() => resolve('reject')}>
                {t('admin.reports.reject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
