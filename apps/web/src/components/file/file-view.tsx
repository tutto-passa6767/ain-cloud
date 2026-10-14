'use client';

import clsx from 'clsx';
import { ArrowLeft, Copy, Download, FolderInput, MapPin, Pencil, Share2, Star, Trash2, ShieldAlert, ShieldX, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { formatBytes, formatDate, formatDuration, formatTaken } from '@/lib/format';
import type { AssetDetail, DriveListing } from '@/lib/types';
import { useMascotMood, useMascotOptional } from '../mascot/mascot-context';
import { useSession } from '../providers';
import { useToast } from '../toast';
import { Button, IconButton, Modal, ProgressBar, Spinner } from '../ui';
import { MoveDialog, NameDialog, useDownload, useErrorText, useRefreshDrive } from '../drive/actions';
import { isBusy, KindIcon, QualityBadge, StateBadge, useReason } from '../drive/bits';
import { EmptyState } from '../drive/drive-view';
import { ShareDialog } from '../share-dialog';
import { PhotoViewer } from './photo-viewer';
import { VideoPlayer } from './video-player';

export function FileView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { me } = useSession();
  const { data, error, mutate } = useSWR<{ asset: AssetDetail; path: { id: string; name: string }[] }>(`/assets/${id}`, {
    refreshInterval: (d) => (d && isBusy(d.asset) ? 2500 : 0),
  });
  const asset = data?.asset;

  // Отметка «открыт» для раздела «Недавние»
  useEffect(() => {
    void api(`/assets/${id}?open=1`).catch(() => undefined);
  }, [id]);

  const processingVideo = asset?.kind === 'VIDEO' && isBusy(asset);
  // Нет доступа — «Растерян» с репликой, пока открыта страница; обработка видео — «Думает» (ТЗ маскота §8.1)
  const denied = error instanceof ApiError && (error.status === 404 || error.status === 403);
  useMascotMood(error ? 'confused' : processingVideo ? 'think' : null, denied ? 'mascot.forbidden' : error ? 'mascot.confused' : processingVideo ? 'mascot.thinking' : undefined, {
    urgent: !!error,
  });
  // Видео готово, пока страница открыта — «Радость»
  const mascot = useMascotOptional();
  const wasProcessing = useRef(false);
  useEffect(() => {
    if (wasProcessing.current && asset && !processingVideo && asset.processing === 'READY') mascot?.react('happy', 4000, t('mascot.videoReady', { name: asset.name }));
    wasProcessing.current = processingVideo;
  }, [processingVideo, asset, mascot, t]);

  // Соседние фото той же папки — для перехода и слайд-шоу
  const { data: siblings } = useSWR<DriveListing>(asset && (asset.kind === 'PHOTO' || asset.kind === 'RAW') ? `/drive?${new URLSearchParams({ ...(asset.folderId ? { folderId: asset.folderId } : {}), sort: 'name', order: 'asc' })}` : null);
  const [prevId, nextId] = useMemo(() => {
    const photos = (siblings?.assets ?? []).filter((a) => (a.kind === 'PHOTO' || a.kind === 'RAW') && a.state !== 'BLOCKED');
    const i = photos.findIndex((a) => a.id === id);
    return i < 0 ? [null, null] : [photos[i - 1]?.id ?? null, photos[i + 1]?.id ?? null];
  }, [siblings, id]);

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="px-4 py-6">
        <EmptyState mood="confused" title={notFound ? t('common.noAccess') : t('common.unknownError')} text={notFound ? t('common.noAccessText') : ''} action={<Button onClick={() => router.push('/drive')}>{t('common.toDrive')}</Button>} />
      </div>
    );
  }
  if (!asset) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6" />
      </div>
    );
  }

  const back = asset.folderId ? `/drive/folder/${asset.folderId}` : '/drive';
  return (
    <div className="flex flex-col gap-4 px-3 py-4 sm:px-6 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link href={back} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" />
          </Link>
          <nav className="flex min-w-0 items-center gap-1 text-sm text-muted" aria-label="Путь">
            <Link href="/drive" className="shrink-0 hover:text-fg">
              {t('common.root')}
            </Link>
            {data!.path.map((p) => (
              <span key={p.id} className="flex min-w-0 items-center gap-1">
                <span>/</span>
                <Link href={`/drive/folder/${p.id}`} className="truncate hover:text-fg" title={p.name}>
                  {p.name}
                </Link>
              </span>
            ))}
          </nav>
        </div>
        <Viewer asset={asset} prevId={prevId} nextId={nextId} planMaxHeight={me?.plan?.maxVideoHeight} />
      </div>
      <DetailsPanel asset={asset} onChanged={() => mutate()} />
    </div>
  );
}

function Viewer({ asset, prevId, nextId, planMaxHeight }: { asset: AssetDetail; prevId: string | null; nextId: string | null; planMaxHeight?: number }) {
  const { t } = useI18n();
  const reason = useReason();
  if (asset.state === 'BLOCKED') {
    return <Notice icon={<ShieldX className="size-8 text-danger" />} text={t('file.blocked', { reason: reason(asset.stateReason) })} />;
  }
  if (asset.state === 'CORRUPTED') {
    return <Notice icon={<ShieldX className="size-8 text-danger" />} text={t('file.corrupted')} />;
  }
  if (asset.state === 'RECEIVED' || asset.state === 'SCANNING') {
    return <Notice icon={<Spinner className="size-8" />} text={t('file.verifying')} thumb={asset.thumbLg} />;
  }
  if (asset.kind === 'VIDEO') {
    if (asset.hls) return <VideoPlayer asset={asset} planMaxHeight={planMaxHeight} />;
    if (asset.processing === 'PENDING' || asset.processing === 'RUNNING') {
      // Пока видео обрабатывается — «Обрабатывается, N%»; проверенный оригинал уже можно скачать (ТЗ §7.2)
      return (
        <Notice
          thumb={asset.thumbLg}
          text={asset.processing === 'PENDING' ? t('file.processingQueued') : t('file.processingOverlay', { p: asset.processingProgress })}
          sub={t('file.processingNote')}
          progress={asset.processing === 'RUNNING' ? asset.processingProgress : undefined}
        />
      );
    }
  }
  if ((asset.kind === 'PHOTO' || asset.kind === 'RAW') && (asset.preview || asset.thumbLg)) {
    return <PhotoViewer asset={asset} prevId={prevId} nextId={nextId} />;
  }
  if (asset.kind === 'AUDIO' && (asset.processing === 'READY' || asset.processing === 'UNSUPPORTED')) {
    return <AudioView asset={asset} />;
  }
  if (asset.kind === 'DOCUMENT' && asset.thumbLg) {
    return <Notice thumb={asset.thumbLg} tall text={asset.name} sub={asset.meta?.pages ? `${t('file.pages')}: ${asset.meta.pages}` : undefined} />;
  }
  if (asset.processing === 'PENDING' || asset.processing === 'RUNNING') {
    return <Notice icon={<Spinner className="size-8" />} text={t('state.processing', { p: asset.processingProgress })} progress={asset.processingProgress} />;
  }
  // Формат хранится, но просмотр не поддерживается — это не потеря оригинала (ТЗ §3)
  return <Notice icon={<KindIcon kind={asset.kind} className="size-10 text-subtle" />} text={t('file.notViewable')} sub={asset.processingError ?? undefined} />;
}

function Notice({ icon, text, sub, thumb, progress, tall }: { icon?: ReactNode; text: string; sub?: string; thumb?: string | null; progress?: number; tall?: boolean }) {
  return (
    <div data-mascot-avoid className={clsx('relative flex w-full items-center justify-center overflow-hidden rounded-xl glass', tall ? 'min-h-[60vh]' : 'aspect-video max-h-[75vh]')}>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className={clsx('absolute inset-0 size-full', tall ? 'object-contain p-6' : 'object-cover opacity-30 blur-sm')} />
      )}
      {!tall && (
        <div className="relative flex max-w-md flex-col items-center gap-3 p-6 text-center">
          {icon}
          <p className="text-base font-medium">{text}</p>
          {progress !== undefined && <ProgressBar className="w-64" value={progress} label={text} />}
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      )}
    </div>
  );
}

function AudioView({ asset }: { asset: AssetDetail }) {
  const { data } = useSWR<{ url: string }>(`/assets/${asset.id}/stream`, { revalidateOnFocus: false });
  return (
    <div data-mascot-avoid className="flex flex-col items-center gap-4 rounded-xl glass p-8">
      <KindIcon kind="AUDIO" className="size-12 text-accent" />
      <p className="text-center font-medium">{asset.meta?.title || asset.name}</p>
      {asset.meta?.artist && <p className="text-sm text-muted">{asset.meta.artist}</p>}
      {data?.url ? <audio controls src={data.url} className="w-full max-w-lg" preload="metadata" /> : <Spinner />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function DetailsPanel({ asset, onChanged }: { asset: AssetDetail; onChanged: () => void }) {
  const { t, locale, intl } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const download = useDownload();
  const refresh = useRefreshDrive();
  const router = useRouter();
  const reason = useReason();
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [description, setDescription] = useState(asset.description);
  const [tag, setTag] = useState('');
  useEffect(() => setDescription(asset.description), [asset.id, asset.description]);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/assets/${asset.id}`, { method: 'PATCH', body });
      onChanged();
      void refresh();
    } catch (e) {
      toast(errText(e), 'error');
    }
  };

  const v = asset.meta?.video;
  const audio: any[] = asset.meta?.audio ?? [];
  const exif = asset.exif ?? {};
  const sens = asset.sensitiveMeta ?? {};
  const lat = sens.GPSLatitude as number | undefined;
  const lon = sens.GPSLongitude as number | undefined;
  const canDownload = asset.state === 'VERIFIED' || asset.state === 'RESTRICTED';

  return (
    <aside data-mascot-avoid className="flex w-full shrink-0 flex-col gap-4 xl:sticky xl:top-18 xl:w-96">
      <div className="rounded-xl glass p-4">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">{asset.name}</h1>
          <IconButton label={asset.starred ? t('common.unstar') : t('common.star')} onClick={() => patch({ starred: !asset.starred })}>
            {asset.starred ? <Star className="size-4 fill-warning text-warning" /> : <Star className="size-4" />}
          </IconButton>
          <IconButton label={t('common.rename')} onClick={() => setRenaming(true)}>
            <Pencil className="size-4" />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <QualityBadge width={asset.width} height={asset.height} kind={asset.kind} />
          <StateBadge asset={asset} full />
        </div>
        {asset.state === 'RESTRICTED' && (
          <p className="mt-3 flex gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
            <ShieldAlert className="size-4 shrink-0" />
            {t('state.restrictedHint', { reason: reason(asset.stateReason) })}
          </p>
        )}
        {/* Главные действия — всегда на одном месте (ТЗ §12) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" className="flex-1" disabled={!canDownload} onClick={() => download(asset)} title={!canDownload ? t('file.verifying') : undefined}>
            <Download className="size-4" />
            {t('drive.downloadOriginal')}
          </Button>
          <IconButton label={t('share.action')} className="size-10 border border-border" disabled={asset.state === 'BLOCKED' || asset.state === 'CORRUPTED'} onClick={() => setSharing(true)}>
            <Share2 className="size-4" />
          </IconButton>
          <IconButton label={t('common.move')} className="size-10 border border-border" onClick={() => setMoving(true)}>
            <FolderInput className="size-4" />
          </IconButton>
          <IconButton label={t('common.delete')} className="size-10 border border-border hover:text-danger" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="rounded-xl glass p-4">
        <label htmlFor="desc" className="text-sm font-medium">
          {t('file.description')}
        </label>
        <textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== asset.description && patch({ description })}
          placeholder={t('file.descriptionPlaceholder')}
          rows={3}
          maxLength={5000}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-subtle focus:border-accent"
        />
        <p className="mt-3 text-sm font-medium">{t('file.tags')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {asset.tags.map((tg) => (
            <span key={tg} className="inline-flex items-center gap-1 rounded-md bg-surface-3 py-0.5 pl-2 pr-1 text-xs">
              #{tg}
              <button type="button" aria-label={`${t('common.delete')} ${tg}`} onClick={() => patch({ tags: asset.tags.filter((x) => x !== tg) })} className="rounded p-0.5 text-muted hover:text-fg">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tag.trim()) {
                e.preventDefault();
                void patch({ tags: [...asset.tags, tag.trim()] });
                setTag('');
              }
            }}
            placeholder={t('file.tagsPlaceholder')}
            aria-label={t('file.tags')}
            maxLength={50}
            className="h-7 min-w-28 flex-1 rounded-md border border-border bg-bg-elevated px-2 text-xs outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="rounded-xl glass p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('file.details')}</h2>
        <dl className="divide-y divide-border">
          <Row label={t('drive.type')}>
            {t(`kind.${asset.kind}`)} · .{asset.extension}
            {asset.detectedMime && <span className="block text-xs text-muted">{asset.detectedMime}</span>}
          </Row>
          <Row label={t('drive.size')}>
            {formatBytes(asset.size, locale)} <span className="text-xs text-muted">({asset.size.toLocaleString(intl)} B)</span>
          </Row>
          <Row label={t('file.takenAt')}>{asset.takenAt ? formatTaken(asset, intl) : <span className="text-muted">{t('file.takenUnknown')}</span>}</Row>
          <Row label={t('file.uploadedAt')}>{formatDate(asset.createdAt, intl, true)}</Row>
          <Row label={t('file.originalName')}>{asset.originalName}</Row>
          {asset.sha256 && (
            <Row label={t('file.checksum')}>
              <button
                type="button"
                className="group flex items-start gap-1 text-left font-mono text-[11px] leading-relaxed text-muted hover:text-fg"
                onClick={() => {
                  void navigator.clipboard?.writeText(asset.sha256!);
                  toast(t('common.copied'), 'success');
                }}
              >
                <span className="break-all">{asset.sha256}</span>
                <Copy className="mt-0.5 size-3 shrink-0 opacity-0 group-hover:opacity-100" />
              </button>
            </Row>
          )}
        </dl>
      </div>

      {(v || audio.length > 0 || Object.keys(exif).length > 0) && (
        <div className="rounded-xl glass p-4">
          <h2 className="mb-2 text-sm font-semibold">{t('file.technical')}</h2>
          <dl className="divide-y divide-border">
            {asset.width && asset.height ? <Row label={t('file.resolution')}>{asset.width}×{asset.height}</Row> : null}
            {asset.durationSec ? <Row label={t('file.duration')}>{formatDuration(asset.durationSec)}</Row> : null}
            {v?.codec && <Row label={t('file.codec')}>{[v.codec, v.profile, v.pixFmt].filter(Boolean).join(' · ')}</Row>}
            {v?.fps ? <Row label={t('file.fps')}>{v.fps}</Row> : null}
            {(v?.bitrate || asset.meta?.bitrate) && <Row label={t('file.bitrate')}>{Math.round((v?.bitrate || asset.meta.bitrate) / 1e5) / 10} {locale === 'en' ? 'Mbps' : 'Мбит/с'}</Row>}
            {v && <Row label={t('file.hdr')}>{v.hdr ?? '—'}</Row>}
            {asset.meta?.container && <Row label={t('file.container')}>{asset.meta.container}</Row>}
            {audio.length > 0 && (
              <Row label={t('file.audio')}>
                {audio.map((a, i) => (
                  <span key={i} className="block">
                    {[a.codec, a.channels ? `${a.channels} ch` : null, a.sampleRate ? `${a.sampleRate / 1000} kHz` : null, a.language].filter(Boolean).join(' · ')}
                  </span>
                ))}
              </Row>
            )}
            {(exif.Make || exif.Model) && <Row label={t('file.camera')}>{[exif.Make, exif.Model].filter(Boolean).join(' ')}</Row>}
            {(exif.LensModel || exif.LensID) && <Row label={t('file.lens')}>{String(exif.LensModel ?? exif.LensID)}</Row>}
            {(exif.ExposureTime || exif.FNumber || exif.ISO) && (
              <Row label={t('file.exposure')}>
                {[
                  exif.ExposureTime ? (Number(exif.ExposureTime) < 1 ? `1/${Math.round(1 / Number(exif.ExposureTime))} ${locale === 'en' ? 's' : 'с'}` : `${exif.ExposureTime} ${locale === 'en' ? 's' : 'с'}`) : null,
                  exif.FNumber ? `f/${exif.FNumber}` : null,
                  exif.ISO ? `ISO ${exif.ISO}` : null,
                  exif.FocalLength ? `${exif.FocalLength} ${locale === 'en' ? 'mm' : 'мм'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Row>
            )}
          </dl>
        </div>
      )}

      {lat !== undefined && lon !== undefined && (
        <div className="rounded-xl glass p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-accent" />
            {t('file.location')}
          </h2>
          <p className="font-mono text-sm">
            {lat.toFixed(5)}, {lon.toFixed(5)}
          </p>
          <p className="mt-2 text-xs text-muted">{t('file.sensitiveNote')}</p>
        </div>
      )}

      <ShareDialog target={sharing ? { assetId: asset.id, name: asset.name } : null} onClose={() => setSharing(false)} />
      <NameDialog open={renaming} title={t('drive.renameTitle')} label={t('drive.name')} initial={asset.name} onClose={() => setRenaming(false)} onSubmit={async (name) => patch({ name })} />
      <MoveDialog open={moving} onClose={() => setMoving(false)} onMove={async (folderId) => patch({ folderId })} />
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('common.delete')}
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={async () => {
                setDeleting(false);
                try {
                  await api(`/assets/${asset.id}`, { method: 'DELETE' });
                  toast(t('drive.movedToTrash'), 'success');
                  void refresh();
                  router.push(asset.folderId ? `/drive/folder/${asset.folderId}` : '/drive');
                } catch (e) {
                  toast(errText(e), 'error');
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('drive.deleteConfirm')}</p>
      </Modal>
    </aside>
  );
}
