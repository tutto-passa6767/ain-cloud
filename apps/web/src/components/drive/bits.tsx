'use client';

import { Archive, FileAudio, FileText, Film, Folder, Image as ImageIcon, File as FileIcon, Camera } from 'lucide-react';
import { useI18n } from '@/i18n';
import { megapixels, qualityLabel, reasonKey } from '@/lib/format';
import type { AssetCard, AssetKind } from '@/lib/types';
import { Badge } from '../ui';

export function KindIcon({ kind, className }: { kind: AssetKind | 'FOLDER'; className?: string }) {
  const cls = className ?? 'size-5';
  switch (kind) {
    case 'FOLDER':
      return <Folder className={cls} />;
    case 'VIDEO':
      return <Film className={cls} />;
    case 'PHOTO':
      return <ImageIcon className={cls} />;
    case 'RAW':
      return <Camera className={cls} />;
    case 'AUDIO':
      return <FileAudio className={cls} />;
    case 'DOCUMENT':
      return <FileText className={cls} />;
    case 'ARCHIVE':
      return <Archive className={cls} />;
    default:
      return <FileIcon className={cls} />;
  }
}

export const FOLDER_COLORS: Record<string, string> = {
  red: '#ff7a7a',
  orange: '#ffa94d',
  yellow: '#f5c451',
  green: '#2ef2a3',
  blue: '#7cc4ff',
  purple: '#b197fc',
  gray: '#9aa8ba',
};

/** Человекочитаемая причина ограничения/блокировки */
export function useReason() {
  const { tx } = useI18n();
  return (reason: string | null) => {
    const key = reasonKey(reason);
    if (!key) return reason ?? '';
    const text = tx(`state.reason.${key}`);
    return text.startsWith('state.') ? reason ?? '' : text;
  };
}

/** Состояние материала по ТЗ §7.1: «Загружено» не означает «проверено и готово» */
export function StateBadge({ asset, full }: { asset: Pick<AssetCard, 'state' | 'stateReason' | 'processing' | 'processingProgress'>; full?: boolean }) {
  const { t } = useI18n();
  const reason = useReason();
  const s = asset.state;
  if (s === 'RECEIVED' || s === 'SCANNING') return <Badge tone="accent">{t(`state.${s}`)}</Badge>;
  if (s === 'CORRUPTED') return <Badge tone="danger" title={reason(asset.stateReason)}>{t('state.CORRUPTED')}</Badge>;
  if (s === 'BLOCKED') return <Badge tone="danger" title={reason(asset.stateReason)}>{t('state.BLOCKED')}</Badge>;
  const restricted = s === 'RESTRICTED' ? <Badge tone="warning" title={t('state.restrictedHint', { reason: reason(asset.stateReason) })}>{t('state.RESTRICTED')}</Badge> : null;
  let proc = null;
  if (asset.processing === 'RUNNING') proc = <Badge tone="accent">{t('state.processing', { p: asset.processingProgress })}</Badge>;
  else if (asset.processing === 'PENDING') proc = <Badge tone="accent">{t('state.pending')}</Badge>;
  else if (asset.processing === 'FAILED') proc = <Badge tone="danger">{t('state.failed')}</Badge>;
  else if (full && asset.processing === 'UNSUPPORTED') proc = <Badge>{t('state.unsupported')}</Badge>;
  else if (full && asset.processing === 'READY') proc = <Badge tone="success">{t('state.ready')}</Badge>;
  else if (full && s === 'VERIFIED') proc = <Badge tone="success">{t('state.VERIFIED')}</Badge>;
  if (!restricted && !proc) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {restricted}
      {proc}
    </span>
  );
}

/** Метка 4K и т. п. — только по реальному разрешению (ТЗ §5) */
export function QualityBadge({ width, height, kind, onMedia }: { width: number | null; height: number | null; kind: AssetKind; onMedia?: boolean }) {
  const { locale } = useI18n();
  const label = kind === 'PHOTO' || kind === 'RAW' ? megapixels(width, height, locale) : kind === 'VIDEO' ? qualityLabel(width, height) : null;
  if (!label) return null;
  // Поверх миниатюры — тёмное стекло с белым текстом, читается на любой картинке
  if (onMedia) return <span className="inline-flex items-center rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white backdrop-blur">{label}</span>;
  const strong = label === '4K' || label === '6K' || label === '8K';
  return <Badge tone={strong ? 'accent' : 'neutral'}>{label}</Badge>;
}

export const isBusy = (a: Pick<AssetCard, 'state' | 'processing'>) =>
  a.state === 'RECEIVED' || a.state === 'SCANNING' || a.processing === 'PENDING' || a.processing === 'RUNNING';
