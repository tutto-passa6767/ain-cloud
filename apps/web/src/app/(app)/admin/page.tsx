'use client';

import useSWR from 'swr';
import { ColumnChart, StatTile } from '@/components/admin/column-chart';
import { PageSpinner } from '@/components/drive/drive-view';
import { useI18n } from '@/i18n';
import { formatBytes } from '@/lib/format';

interface Dashboard {
  users: { total: number; newToday: number; dau: number; mau: number };
  storage: { usedBytes: number; reservedBytes: number };
  registrations: { day: string; count: number }[];
  uploads: { day: string; bytes: number; count: number }[];
  processing: { failed: number; verifyQueue: Record<string, number>; processQueue: Record<string, number>; workers: number };
  security: { restricted: number; blocked: number; openReports: number; loginFailed24h: number; shareUnlockFailed24h: number };
  revenue: number | null;
}

/** Последние 14 дней с нулями для дней без событий — пропуски не скрываются */
function days14<T extends { day: string }>(rows: T[], pick: (r: T) => number, intl: string) {
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), pick(r)]));
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    out.push({ label: d.toLocaleDateString(intl, { day: 'numeric', month: 'short' }), value: byDay.get(key) ?? 0 });
  }
  return out;
}

export default function AdminDashboard() {
  const { t, locale, intl } = useI18n();
  const { data } = useSWR<Dashboard>('/admin/dashboard', { refreshInterval: 30_000 });
  if (!data) return <PageSpinner />;
  const q = data.processing.processQueue;
  const queued = (q.waiting ?? 0) + (q.prioritized ?? 0) + (q.active ?? 0) + (q.delayed ?? 0);
  const n = (v: number) => v.toLocaleString(intl);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <StatTile label={t('admin.kpi.users')} value={n(data.users.total)} hint={`${t('admin.kpi.newToday')}: ${n(data.users.newToday)}`} />
        <StatTile label={t('admin.kpi.dau')} value={n(data.users.dau)} hint={`${t('admin.kpi.mau')}: ${n(data.users.mau)}`} />
        <StatTile label={t('admin.kpi.storage')} value={formatBytes(data.storage.usedBytes, locale)} />
        <StatTile label={t('admin.kpi.queue')} value={n(queued)} hint={t('admin.kpi.workers', { n: data.processing.workers })} />
        <StatTile label={t('admin.kpi.failed')} value={n(data.processing.failed)} />
        <StatTile label={t('admin.kpi.restricted')} value={n(data.security.restricted)} />
        <StatTile label={t('admin.kpi.reports')} value={n(data.security.openReports)} />
        <StatTile label={t('admin.kpi.loginFailed')} value={n(data.security.loginFailed24h)} />
        <StatTile label={t('admin.kpi.revenue')} value="—" hint={data.revenue === null ? t('admin.kpi.revenueNone') : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnChart title={t('admin.charts.registrations')} points={days14(data.registrations, (r) => r.count, intl)} />
        <ColumnChart
          title={t('admin.charts.uploads')}
          points={days14(data.uploads, (r) => r.bytes / 1024 ** 3, intl)}
          format={(v) => (v < 0.1 && v > 0 ? '<0,1' : (Math.round(v * 10) / 10).toLocaleString(intl))}
        />
      </div>
    </div>
  );
}
