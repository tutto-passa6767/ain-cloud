'use client';

import { ChevronRight, Download, Flag, Folder, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { KindIcon, QualityBadge } from '@/components/drive/bits';
import { PhotoViewer } from '@/components/file/photo-viewer';
import { VideoPlayer } from '@/components/file/video-player';
import { CloudIcon } from '@/components/mascot/cloud-icon';
import { PublicPage } from '@/components/public';
import { useToast } from '@/components/toast';
import { Button, Input, Modal, Spinner, TruncatedName } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import type { AssetCard, AssetDetail, FolderItem } from '@/lib/types';

interface Meta {
  type: 'asset' | 'folder';
  requiresPassword: boolean;
  viewOnly: boolean;
  expiresAt: string | null;
  ownerName: string;
  name: string | null;
  downloadsLeft: number | null;
}

function useShareError() {
  const { t, tx } = useI18n();
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return t('common.unknownError');
    const own = tx(`publicLink.errors.${e.code}`);
    if (!own.startsWith('publicLink.')) return own;
    const common = tx(`errors.${e.code}`);
    return common.startsWith('errors.') ? e.message : common;
  };
}

/** Страница гостя по публичной ссылке (ТЗ §5 /s/:token, §9) */
function ShareInner() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const { t, intl } = useI18n();
  const base = `/public/s/${token}`;
  const { data: meta, error, mutate } = useSWR<Meta>(base, { revalidateOnFocus: false });

  if (error) {
    const code = error instanceof ApiError ? error.code : '';
    const [title, text] =
      code === 'SHARE_REVOKED'
        ? [t('publicLink.revoked'), t('publicLink.revokedText')]
        : code === 'SHARE_EXPIRED'
          ? [t('publicLink.expired'), t('publicLink.expiredText')]
          : code === 'SHARE_BLOCKED'
            ? [t('publicLink.blocked'), t('publicLink.blockedText')]
            : [t('publicLink.notFound'), t('publicLink.notFoundText')];
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <CloudIcon size={96} mood="confused" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-md text-sm text-muted">{text}</p>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (meta.requiresPassword) return <PasswordForm token={token} onUnlocked={() => mutate()} />;

  const assetId = params.get('a');
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{t('publicLink.sharedBy', { name: meta.ownerName })}</span>
        {meta.expiresAt && <span>· {t('share.expiresAt')} {formatDate(meta.expiresAt, intl)}</span>}
        {meta.viewOnly && <span>· {t('publicLink.viewOnly')}</span>}
        {meta.downloadsLeft !== null && !meta.viewOnly && <span>· {t('publicLink.downloadsLeft', { n: meta.downloadsLeft })}</span>}
        <ReportButton token={token} assetId={assetId ?? undefined} />
      </div>
      {meta.type === 'asset' ? <SharedAsset token={token} meta={meta} /> : assetId ? <SharedAsset token={token} meta={meta} assetId={assetId} /> : <SharedFolder token={token} folderId={params.get('f')} />}
    </div>
  );
}

function PasswordForm({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const { t } = useI18n();
  const errText = useShareError();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <div className="rounded-2xl glass p-6">
        <Lock className="size-6 text-accent" />
        <h1 className="mt-3 text-lg font-semibold">{t('publicLink.passwordTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('publicLink.passwordText')}</p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api(`/public/s/${token}/unlock`, { method: 'POST', body: { password } });
              onUnlocked();
            } catch (er) {
              setError(errText(er));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label={t('share.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} autoFocus />
          <Button type="submit" variant="primary" loading={busy} disabled={!password}>
            {t('publicLink.open')}
          </Button>
        </form>
      </div>
    </div>
  );
}

function SharedAsset({ token, meta, assetId }: { token: string; meta: Meta; assetId?: string }) {
  const { t, locale, intl } = useI18n();
  const toast = useToast();
  const errText = useShareError();
  const key = assetId ? `/public/s/${token}/assets/${assetId}` : `/public/s/${token}/content`;
  const { data, error } = useSWR<{ asset: AssetDetail }>(key, { refreshInterval: (d) => (d?.asset && ['PENDING', 'RUNNING'].includes(d.asset.processing) ? 4000 : 0) });
  const [busy, setBusy] = useState(false);
  if (error) return <p className="py-10 text-center text-muted">{errText(error)}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner /></div>;
  const a = data.asset;

  const download = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>(`/public/s/${token}/assets/${a.id}/download`, { method: 'POST' });
      window.location.href = r.url;
    } catch (e) {
      toast(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        {a.kind === 'VIDEO' && a.hls ? (
          <VideoPlayer asset={a} src={`/api/public/s/${token}/assets/${a.id}/hls/master.m3u8`} />
        ) : (a.kind === 'PHOTO' || a.kind === 'RAW') && (a.preview || a.thumbLg) ? (
          <PhotoViewer asset={a} prevId={null} nextId={null} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl glass">
            {a.thumbLg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumbLg} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <KindIcon kind={a.kind} className="size-12 text-subtle" />
            )}
          </div>
        )}
      </div>
      <aside className="flex flex-col gap-3 rounded-xl glass p-4">
        <h1 className="break-words text-lg font-semibold">{a.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          <QualityBadge width={a.width} height={a.height} kind={a.kind} />
        </div>
        <p className="text-sm text-muted">
          {t(`kind.${a.kind}`)} · {formatBytes(a.size, locale)}
          {a.durationSec ? ` · ${formatDuration(a.durationSec)}` : ''}
        </p>
        {a.description && <p className="text-sm">{a.description}</p>}
        <p className="text-xs text-subtle">{formatDate(a.createdAt, intl)}</p>
        {!meta.viewOnly && (
          <Button variant="primary" loading={busy} onClick={download}>
            <Download className="size-4" />
            {t('publicLink.download')}
          </Button>
        )}
      </aside>
    </div>
  );
}

function SharedFolder({ token, folderId }: { token: string; folderId: string | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const errText = useShareError();
  const { data, error } = useSWR<{ folder: { id: string; name: string }; path: { id: string; name: string }[]; folders: FolderItem[]; assets: AssetCard[] }>(
    `/public/s/${token}/content${folderId ? `?folderId=${folderId}` : ''}`,
  );
  if (error) return <p className="py-10 text-center text-muted">{errText(error)}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner /></div>;
  const href = (q: Record<string, string>) => `/s/${token}?${new URLSearchParams(q)}`;
  return (
    <div>
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-lg" aria-label="Путь">
        {data.path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-4 text-subtle" />}
            {i === data.path.length - 1 ? (
              <h1 className="font-semibold">{p.name}</h1>
            ) : (
              <Link href={i === 0 ? `/s/${token}` : href({ f: p.id })} className="text-muted hover:text-fg">
                {p.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
      {data.folders.length + data.assets.length === 0 ? (
        <p className="py-16 text-center text-muted">{t('publicLink.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {data.folders.map((f) => (
            <Link key={f.id} href={href({ f: f.id })} className="flex items-center gap-3 rounded-xl glass p-4 hover:border-border-strong">
              <Folder className="size-6 text-subtle" />
              <TruncatedName name={f.name} className="text-sm font-medium" />
            </Link>
          ))}
          {data.assets.map((a) => (
            <button key={a.id} type="button" onClick={() => router.push(href({ a: a.id, ...(folderId ? { f: folderId } : {}) }))} className="overflow-hidden rounded-xl glass text-left hover:border-border-strong">
              <div className="relative flex aspect-video items-center justify-center bg-surface-2">
                {a.thumbLg || a.thumbSm ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(a.thumbLg ?? a.thumbSm)!} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <KindIcon kind={a.kind} className="size-8 text-subtle" />
                )}
                <span className="absolute bottom-1.5 left-1.5">
                  <QualityBadge width={a.width} height={a.height} kind={a.kind} />
                </span>
              </div>
              <div className="p-3">
                <TruncatedName name={a.name} className="text-sm font-medium" />
                <p className="text-xs text-muted">{formatBytes(a.size, locale)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** «Пожаловаться» на публичных ссылках → очередь жалоб модераторов (ТЗ §10.2) */
function ReportButton({ token, assetId }: { token: string; assetId?: string }) {
  const { t, tx } = useI18n();
  const toast = useToast();
  const errText = useShareError();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('illegal');
  const [text, setText] = useState('');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
        <Flag className="size-4" />
        {t('publicLink.report')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('publicLink.reportTitle')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/public/s/${token}/report`, { method: 'POST', body: { reason, text, ...(assetId ? { assetId } : {}) } });
                  toast(t('publicLink.reportSent'), 'success');
                  setOpen(false);
                } catch (e) {
                  toast(errText(e), 'error');
                }
              }}
            >
              {t('publicLink.reportSend')}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('publicLink.reportReason')}</legend>
          {['illegal', 'copyright', 'malware', 'abuse', 'other'].map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {tx(`publicLink.reasons.${r}`)}
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block text-sm font-medium" htmlFor="report-text">
          {t('publicLink.reportText')}
        </label>
        <textarea id="report-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm" />
      </Modal>
    </>
  );
}

export default function SharePage() {
  return (
    <PublicPage>
      <Suspense>
        <ShareInner />
      </Suspense>
    </PublicPage>
  );
}
