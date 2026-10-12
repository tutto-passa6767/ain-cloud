'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useErrorText } from '@/components/drive/actions';
import { PageSpinner } from '@/components/drive/drive-view';
import { useSession } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  planCode: string;
  usedBytes: number;
  quotaBytes: number;
  quotaOverride: number | null;
  twoFactor: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  assets: number;
}

export default function AdminUsers() {
  const { t, locale, intl } = useI18n();
  const { user: me } = useSession();
  const toast = useToast();
  const errText = useErrorText();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, mutate } = useSWR<{ total: number; items: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`);
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ planCode: 'FREE', quota: '', role: 'USER', reason: '' });
  const isAdmin = me?.role === 'ADMIN';

  const open = (u: AdminUser) => {
    setEdit(u);
    setForm({ planCode: u.planCode, quota: u.quotaOverride ? String(Math.round(u.quotaOverride / 1024 ** 3)) : '', role: u.role, reason: '' });
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      toast(t('common.saved'), 'success');
      await mutate();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} className="h-9 w-full max-w-sm rounded-lg glass-2 px-3 text-sm" />
        {data && <span className="text-sm text-muted">{t('admin.users.total', { n: data.total })}</span>}
      </div>
      {!data ? (
        <PageSpinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t('admin.users.email')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.users.plan')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.users.usage')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.users.role')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.users.status')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.users.created')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium">{u.email}</p>
                    <p className="text-xs text-muted">{u.name}</p>
                  </td>
                  <td className="px-3 py-2">{u.planCode}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatBytes(u.usedBytes, locale)} / {formatBytes(u.quotaBytes, locale)}
                  </td>
                  <td className="px-3 py-2">
                    {u.role}
                    {u.twoFactor && <Badge className="ml-1.5">2FA</Badge>}
                  </td>
                  <td className="px-3 py-2">{u.blockedAt ? <Badge tone="danger" title={u.blockedReason ?? ''}>{t('admin.users.blocked')}</Badge> : <Badge tone="success">{t('admin.users.active')}</Badge>}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(u.createdAt, intl)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" onClick={() => open(u)}>
                      {t('common.open')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.email ?? ''} wide>
        {edit && (
          <div className="flex flex-col gap-4">
            {isAdmin && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('admin.users.plan')}
                  <select value={form.planCode} onChange={(e) => setForm((f) => ({ ...f, planCode: e.target.value }))} className="h-10 rounded-lg border border-border bg-bg-elevated px-2">
                    {['FREE', 'PRO', 'PRO_MAX', 'BUSINESS'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <Input label={t('admin.users.quota')} type="number" min={0} value={form.quota} onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))} />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('admin.users.role')}
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} disabled={edit.id === me?.id} className="h-10 rounded-lg border border-border bg-bg-elevated px-2">
                    {['USER', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT', 'ADMIN'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-3">
                  <Button
                    variant="primary"
                    onClick={() =>
                      patch(edit.id, {
                        planCode: form.planCode,
                        quotaOverrideGb: form.quota ? Number(form.quota) : null,
                        ...(form.role !== edit.role ? { role: form.role } : {}),
                      })
                    }
                  >
                    {t('admin.users.save')}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
              {!edit.blockedAt && (
                <div className="flex-1">
                  <Input label={t('admin.users.reason')} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} maxLength={500} />
                </div>
              )}
              {edit.id !== me?.id &&
                (edit.blockedAt ? (
                  <Button onClick={async () => { await patch(edit.id, { blocked: false }); setEdit(null); }}>{t('admin.users.unblock')}</Button>
                ) : (
                  <Button variant="danger" disabled={!form.reason.trim()} onClick={async () => { await patch(edit.id, { blocked: true, blockedReason: form.reason }); setEdit(null); }}>
                    {t('admin.users.block')}
                  </Button>
                ))}
              {edit.twoFactor && edit.id !== me?.id && (
                <Button
                  onClick={async () => {
                    await api(`/admin/users/${edit.id}/reset-2fa`, { method: 'POST' }).catch((e) => toast(errText(e), 'error'));
                    await mutate();
                    setEdit(null);
                  }}
                >
                  {t('admin.users.reset2fa')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
