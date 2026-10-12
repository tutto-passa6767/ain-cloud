'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { PageSpinner } from '@/components/drive/drive-view';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';

interface Event {
  id: string;
  at: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  meta: unknown;
}

/** Журнал действий с фильтрами и выгрузкой (ТЗ §10.3, §15). Редактировать журнал нельзя. */
export default function AdminAudit() {
  const { t, intl } = useI18n();
  const [form, setForm] = useState({ action: '', target: '', from: '', to: '' });
  const [filters, setFilters] = useState(form);
  const qs = (before?: string) => new URLSearchParams(Object.entries({ ...filters, ...(before ? { before } : {}) }).filter(([, v]) => v) as [string, string][]).toString();
  const { data, size, setSize, isLoading } = useSWRInfinite<{ items: Event[]; next: string | null }>((i, prev) => (i === 0 ? `/admin/audit?${qs()}` : prev?.next ? `/admin/audit?${qs(prev.next)}` : null));
  const rows = (data ?? []).flatMap((p) => p.items);
  const hasMore = !!data?.[data.length - 1]?.next;
  const field = 'h-9 rounded-lg border border-border bg-bg-elevated px-2 text-sm';

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(form);
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('admin.audit.action')}
          <input value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} placeholder="auth., share., admin." className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('admin.audit.target')}
          <input value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('admin.audit.from')}
          <input type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t('admin.audit.to')}
          <input type="date" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} className={field} />
        </label>
        <Button type="submit" variant="primary">
          {t('admin.audit.apply')}
        </Button>
        <a href={`/api/admin/audit.csv?${qs()}`} className="inline-flex h-10 items-center gap-2 rounded-lg glass-2 px-4 text-sm font-medium hover:bg-surface-3">
          <Download className="size-4" />
          {t('admin.audit.export')}
        </a>
      </form>
      {isLoading && !data ? (
        <PageSpinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t('admin.audit.at')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.audit.action')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.audit.actor')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.audit.target')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.audit.ip')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{formatDate(e.at, intl, true)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-2 text-xs">{e.actorEmail ?? (e.actorId ? e.actorId.slice(0, 8) : '—')}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{e.targetType ? `${e.targetType}:${(e.targetId ?? '').slice(0, 12)}` : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{e.ip ?? '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-[11px] text-subtle" title={e.meta ? JSON.stringify(e.meta) : ''}>
                    {e.meta ? JSON.stringify(e.meta) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <Button className="self-center" onClick={() => setSize(size + 1)}>
          {t('admin.audit.more')}
        </Button>
      )}
    </div>
  );
}
