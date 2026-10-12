'use client';

import clsx from 'clsx';
import { Check, Download, Ellipsis, FolderInput, Pencil, Share2, Star, StarOff, Trash2, ExternalLink, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import type { AssetCard, FolderItem, Item } from '@/lib/types';
import { Menu, MenuItem, TruncatedName } from '../ui';
import { FOLDER_COLORS, KindIcon, QualityBadge, StateBadge } from './bits';

export type ItemAction = 'open' | 'download' | 'share' | 'rename' | 'move' | 'star' | 'trash';

export const itemKey = (i: Item) => `${i.type === 'folder' ? 'f' : 'a'}:${i.id}`;
export const itemHref = (i: Item) => (i.type === 'folder' ? `/drive/folder/${i.id}` : `/drive/file/${i.id}`);

interface Entry {
  action: ItemAction;
  icon: ReactNode;
  label: string;
  danger?: boolean;
}

/** Действия с объектом — одни и те же для меню «⋯» и контекстного меню по правому клику */
function useEntries() {
  const { t } = useI18n();
  return (item: Item): Entry[] => {
    const unusable = item.type === 'asset' && (item.state === 'BLOCKED' || item.state === 'CORRUPTED');
    return [
      { action: 'open', icon: <ExternalLink />, label: t('common.open') },
      ...(item.type === 'asset' && !unusable ? [{ action: 'download' as const, icon: <Download />, label: t('drive.downloadOriginal') }] : []),
      ...(!unusable ? [{ action: 'share' as const, icon: <Share2 />, label: t('share.action') }] : []),
      { action: 'rename', icon: <Pencil />, label: t('common.rename') },
      { action: 'move', icon: <FolderInput />, label: t('common.move') },
      { action: 'star', icon: item.starred ? <StarOff /> : <Star />, label: item.starred ? t('common.unstar') : t('common.star') },
      { action: 'trash', icon: <Trash2 />, label: t('common.delete'), danger: true },
    ];
  };
}

function ItemMenu({ item, onAction }: { item: Item; onAction: (a: ItemAction, item: Item) => void }) {
  const { t } = useI18n();
  const entries = useEntries();
  return (
    <Menu
      label={item.name}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          aria-label={`${t('common.open')}: ${item.name}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
        >
          <Ellipsis className="size-4" />
        </button>
      )}
    >
      {(close) =>
        entries(item).map((e) => (
          <MenuItem
            key={e.action}
            icon={e.icon}
            danger={e.danger}
            onClick={() => {
              close();
              onAction(e.action, item);
            }}
          >
            {e.label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

/** Контекстное меню по правому клику: появляется у курсора, не выходит за края экрана */
export function ItemContextMenu({ state, onClose, onAction }: { state: { item: Item; x: number; y: number } | null; onClose: () => void; onAction: (a: ItemAction, item: Item) => void }) {
  const entries = useEntries();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!state || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(state.x, window.innerWidth - r.width - 8), y: Math.min(state.y, window.innerHeight - r.height - 8) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [state, onClose]);

  if (!state) return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={state.item.name}
      className="glass-strong animate-pop fixed z-50 min-w-56 overflow-hidden rounded-xl p-1"
      style={{ left: pos?.x ?? state.x, top: pos?.y ?? state.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="truncate px-2.5 pb-1.5 pt-1 text-xs text-subtle" title={state.item.name}>
        {state.item.name}
      </p>
      {entries(state.item).map((e) => (
        <MenuItem
          key={e.action}
          icon={e.icon}
          danger={e.danger}
          onClick={() => {
            onClose();
            onAction(e.action, state.item);
          }}
        >
          {e.label}
        </MenuItem>
      ))}
    </div>,
    document.body,
  );
}

function SelectBox({ selected, onToggle, label }: { selected: boolean; onToggle: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(e);
      }}
      className={clsx(
        'flex size-6 items-center justify-center rounded-md border backdrop-blur transition-all',
        selected ? 'border-accent bg-accent text-accent-fg' : 'border-border-strong bg-bg/50 text-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
      )}
    >
      <Check className="size-3.5" />
    </button>
  );
}

interface CommonProps {
  item: Item;
  selected: boolean;
  anySelected: boolean;
  onSelect: (item: Item, e: React.MouseEvent) => void;
  onAction: (a: ItemAction, item: Item) => void;
  onContext?: (item: Item, e: React.MouseEvent) => void;
}

/** Миниатюра; у видео при наведении проигрывается короткое анимированное превью */
function Thumb({ asset, folder }: { asset: AssetCard | null; folder: FolderItem | null }) {
  const [hover, setHover] = useState(false);
  const [animReady, setAnimReady] = useState(false);
  const thumb = asset?.thumbLg ?? asset?.thumbSm;
  const animated = asset?.animated;

  // Анимированное превью подгружается только при первом наведении
  useEffect(() => {
    if (!hover || !animated || animReady) return;
    const img = new Image();
    img.onload = () => setAnimReady(true);
    img.src = animated;
  }, [hover, animated, animReady]);

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface-2" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {thumb ? (
        // Карточки строятся из миниатюр, оригиналы для этого не скачиваются (ТЗ §5)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
      ) : (
        <span className="text-subtle" style={folder?.color ? { color: FOLDER_COLORS[folder.color] } : undefined}>
          <KindIcon kind={folder ? 'FOLDER' : asset!.kind} className="size-10" />
        </span>
      )}
      {animated && hover && animReady && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={animated} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {asset?.kind === 'VIDEO' && thumb && (
        <span className={clsx('absolute flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-opacity', hover ? 'opacity-0' : 'opacity-100')}>
          <Play className="ml-0.5 size-4 fill-white" />
        </span>
      )}
      {thumb && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />}
      {asset?.durationSec ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">{formatDuration(asset.durationSec)}</span>
      ) : null}
      {asset && (
        <span className="absolute bottom-1.5 left-1.5">
          <QualityBadge width={asset.width} height={asset.height} kind={asset.kind} onMedia />
        </span>
      )}
    </div>
  );
}

/** Карточка сетки: миниатюра, название, тип, размер, дата, состояние; для видео — длительность и реальное разрешение */
export function ItemCard({ item, selected, anySelected, onSelect, onAction, onContext }: CommonProps) {
  const { t, locale, intl } = useI18n();
  const asset = item.type === 'asset' ? (item as AssetCard) : null;
  const folder = item.type === 'folder' ? (item as FolderItem) : null;
  return (
    <div
      className={clsx('glass-card lift spotlight group relative overflow-hidden rounded-xl', selected && 'border-accent ring-1 ring-accent')}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        onContext(item, e);
      }}
    >
      <Link
        href={itemHref(item)}
        onClick={(e) => {
          if (anySelected || e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            onSelect(item, e);
          }
        }}
        className="block focus-visible:outline-none"
        aria-label={item.name}
      >
        <Thumb asset={asset} folder={folder} />
        <div className="flex flex-col gap-1 px-3 pb-3 pt-2.5">
          <div className="flex items-center gap-1.5 pr-7">
            {item.starred && <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label={t('common.starred')} />}
            <TruncatedName name={item.name} className="text-sm font-medium" />
          </div>
          <p className="truncate text-xs text-muted">
            {folder ? t('kind.FOLDER') : `${t(`kind.${asset!.kind}`)} · ${formatBytes(asset!.size, locale)}`} · {formatDate(item.createdAt, intl)}
          </p>
          {asset && <StateBadge asset={asset} />}
        </div>
      </Link>
      <div className="absolute left-2 top-2">
        <SelectBox selected={selected} onToggle={(e) => onSelect(item, e)} label={item.name} />
      </div>
      <div className="absolute bottom-2.5 right-1.5 opacity-80 group-hover:opacity-100">
        <ItemMenu item={item} onAction={onAction} />
      </div>
    </div>
  );
}

export function ItemRow({ item, selected, anySelected, onSelect, onAction, onContext }: CommonProps) {
  const { t, locale, intl } = useI18n();
  const asset = item.type === 'asset' ? (item as AssetCard) : null;
  const folder = item.type === 'folder' ? (item as FolderItem) : null;
  return (
    <div
      role="row"
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        onContext(item, e);
      }}
      className={clsx('group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_110px_100px_130px_auto]', selected ? 'bg-accent-soft' : 'hover:bg-surface-2')}
    >
      <SelectBox selected={selected} onToggle={(e) => onSelect(item, e)} label={item.name} />
      <Link
        href={itemHref(item)}
        onClick={(e) => {
          if (anySelected || e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            onSelect(item, e);
          }
        }}
        className="flex min-w-0 items-center gap-3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-subtle" style={folder?.color ? { color: FOLDER_COLORS[folder.color] } : undefined}>
          {asset?.thumbSm ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.thumbSm} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <KindIcon kind={folder ? 'FOLDER' : asset!.kind} className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {item.starred && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
            <TruncatedName name={item.name} className="text-sm" />
          </span>
          {asset && (
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <QualityBadge width={asset.width} height={asset.height} kind={asset.kind} />
              {asset.durationSec ? <span className="text-xs text-muted">{formatDuration(asset.durationSec)}</span> : null}
              <StateBadge asset={asset} />
            </span>
          )}
        </span>
      </Link>
      <span className="hidden text-sm text-muted sm:block">{folder ? t('kind.FOLDER') : t(`kind.${asset!.kind}`)}</span>
      <span className="hidden text-sm text-muted sm:block">{asset ? formatBytes(asset.size, locale) : '—'}</span>
      <span className="hidden text-sm text-muted sm:block">{formatDate(item.createdAt, intl)}</span>
      <ItemMenu item={item} onAction={onAction} />
    </div>
  );
}
