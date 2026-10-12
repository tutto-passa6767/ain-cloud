'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useErrorText } from '@/components/drive/actions';
import { PageSpinner } from '@/components/drive/drive-view';
import { useToast } from '@/components/toast';
import { Button, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

const NUMERIC = ['upload.partSizeMb', 'upload.parallelParts', 'upload.sessionTtlDays', 'trash.retentionDays', 'processing.maxAttempts'] as const;
const KINDS = ['VIDEO', 'PHOTO', 'RAW', 'AUDIO', 'DOCUMENT', 'ARCHIVE'] as const;

/** Разрешённые форматы, параметры загрузки, сроки корзины и сессий (ТЗ §15) — без разработчиков */
export default function AdminSettings() {
  const { t, tx } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const { data, mutate } = useSWR<{ items: { key: string; value: unknown }[] }>('/admin/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!data) return <PageSpinner />;
  const value = (k: string) => data.items.find((i) => i.key === k)?.value;
  const formats = (value('formats.allowed') ?? {}) as Record<string, string[]>;

  const save = async (key: string, v: unknown) => {
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: v } });
      toast(t('admin.settings.saved'), 'success');
      setDraft((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      await mutate();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="grid gap-4 rounded-xl glass p-5 sm:grid-cols-2">
        {NUMERIC.map((k) => (
          <form
            key={k}
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(k, Number(draft[k]));
            }}
          >
            <div className="flex-1">
              <Input label={tx(`admin.settings.${k}`)} type="number" value={draft[k] ?? String(value(k) ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
            </div>
            <Button type="submit" disabled={draft[k] === undefined}>
              {t('common.save')}
            </Button>
          </form>
        ))}
      </section>
      <section className="rounded-xl glass p-5">
        <h2 className="mb-3 text-sm font-semibold">{tx('admin.settings.formats.allowed')}</h2>
        <div className="flex flex-col gap-3">
          {KINDS.map((kind) => {
            const key = `formats.${kind}`;
            const current = (formats[kind] ?? []).join(', ');
            return (
              <form
                key={kind}
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const list = (draft[key] ?? current).split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
                  void save('formats.allowed', { ...formats, [kind]: list });
                }}
              >
                <div className="flex-1">
                  <Input label={t(`kind.${kind}`)} value={draft[key] ?? current} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
                </div>
                <Button type="submit" disabled={draft[key] === undefined}>
                  {t('common.save')}
                </Button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
