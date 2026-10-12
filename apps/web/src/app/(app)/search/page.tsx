'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { DriveView, PageSpinner } from '@/components/drive/drive-view';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';

const MB = 1024 * 1024;
const FIELDS = ['q', 'kind', 'state', 'processing', 'uploadedFrom', 'uploadedTo', 'takenFrom', 'takenTo', 'minSize', 'maxSize', 'minHeight'] as const;
type Field = (typeof FIELDS)[number];

function SearchInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const read = () => Object.fromEntries(FIELDS.map((f) => [f, params.get(f) ?? ''])) as Record<Field, string>;
  const [form, setForm] = useState(read);
  useEffect(() => setForm(read()), [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Запрос к API: размеры в МБ переводятся в байты, даты — в границы дня
  const api = new URLSearchParams();
  for (const f of FIELDS) {
    const v = params.get(f);
    if (!v) continue;
    if (f === 'minSize' || f === 'maxSize') api.set(f, String(Math.round(Number(v) * MB)));
    else if (f === 'uploadedTo' || f === 'takenTo') api.set(f, `${v}T23:59:59`);
    else api.set(f, v);
  }
  const key = `/search?${api}`;

  const apply = () => {
    const next = new URLSearchParams();
    for (const f of FIELDS) if (form[f]) next.set(f, form[f]);
    router.push(`/search?${next}`);
  };
  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [f]: e.target.value }));
  const field = 'h-9 rounded-lg border border-border bg-bg-elevated px-2 text-sm outline-none focus:border-accent';

  return (
    <div className="flex flex-col">
      <div className="px-3 pt-4 sm:px-6">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <input type="search" value={form.q} onChange={set('q')} placeholder={t('search.placeholder')} aria-label={t('common.search')} className={`${field} min-w-0 flex-1`} />
          <Button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <SlidersHorizontal className="size-4" />
            {t('search.filters')}
          </Button>
          <Button type="submit" variant="primary">
            {t('common.search')}
          </Button>
        </form>
        {open && (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl glass p-4 sm:grid-cols-2 lg:grid-cols-4">
            <select value={form.kind} onChange={set('kind')} className={field} aria-label={t('drive.type')}>
              <option value="">{t('search.anyKind')}</option>
              {(['VIDEO', 'PHOTO', 'RAW', 'AUDIO', 'DOCUMENT', 'ARCHIVE'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>
            <select value={form.state} onChange={set('state')} className={field} aria-label={t('file.status')}>
              <option value="">{t('search.anyState')}</option>
              {(['VERIFIED', 'SCANNING', 'RESTRICTED', 'BLOCKED', 'CORRUPTED'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`state.${s}`)}
                </option>
              ))}
            </select>
            <select value={form.processing} onChange={set('processing')} className={field} aria-label={t('state.processing', { p: '' })}>
              <option value="">{t('search.anyState')}</option>
              <option value="READY">{t('state.ready')}</option>
              <option value="RUNNING">{t('state.processing', { p: '…' })}</option>
              <option value="PENDING">{t('state.pending')}</option>
              <option value="FAILED">{t('state.failed')}</option>
              <option value="UNSUPPORTED">{t('state.unsupported')}</option>
            </select>
            <select value={form.minHeight} onChange={set('minHeight')} className={field} aria-label={t('search.minResolution')}>
              <option value="">
                {t('search.minResolution')}: {t('search.any')}
              </option>
              <option value="2160">4K (2160p)</option>
              <option value="1440">1440p</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
            </select>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.uploadedFrom')}
              <input type="date" value={form.uploadedFrom} onChange={set('uploadedFrom')} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.uploadedTo')}
              <input type="date" value={form.uploadedTo} onChange={set('uploadedTo')} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.takenFrom')}
              <input type="date" value={form.takenFrom} onChange={set('takenFrom')} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.takenTo')}
              <input type="date" value={form.takenTo} onChange={set('takenTo')} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.minSize')}
              <input type="number" min={0} value={form.minSize} onChange={set('minSize')} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('search.maxSize')}
              <input type="number" min={0} value={form.maxSize} onChange={set('maxSize')} className={field} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="button" onClick={() => router.push(`/search${form.q ? `?q=${encodeURIComponent(form.q)}` : ''}`)}>
                {t('search.reset')}
              </Button>
              <Button type="button" variant="primary" onClick={apply}>
                {t('common.search')}
              </Button>
            </div>
          </div>
        )}
      </div>
      <DriveView key={key} mode="search" searchKey={key} title={params.get('q') ? `${t('search.title')}: «${params.get('q')}»` : t('search.title')} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <SearchInner />
    </Suspense>
  );
}
