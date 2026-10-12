'use client';

import clsx from 'clsx';
import { ChevronRight, CloudUpload, FolderInput, FolderPlus, FolderUp, LayoutGrid, List, Star, Trash2, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import type { AssetCard, DriveListing, Item } from '@/lib/types';
import { filesFromDrop, filesFromInput, getUploadManager } from '@/lib/uploader/react';
import { useMascot, useMascotMood, useMascotOptional } from '../mascot/mascot-context';
import { BarysIcon } from '../mascot/barys-icon';
import { useToast } from '../toast';
import { ShareDialog } from '../share-dialog';
import { Button, IconButton, Menu, MenuItem, Modal, Spinner } from '../ui';
import { MoveDialog, NameDialog, useDownload, useErrorText, useRefreshDrive } from './actions';
import { isBusy } from './bits';
import { ItemCard, ItemContextMenu, itemHref, itemKey, ItemRow, type ItemAction } from './item-views';
import { driveBus } from '@/lib/drive-bus';
import { formatBytes } from '@/lib/format';
import { useSession } from '../providers';
import { isMac } from '../command-center';

export type DriveMode = 'folder' | 'recent' | 'starred' | 'search';
type Sort = 'name' | 'createdAt' | 'size' | 'kind' | 'takenAt';

const readPref = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* приватный режим */
  }
};

export function DriveView({ mode, folderId = null, searchKey, title, emptyText }: { mode: DriveMode; folderId?: string | null; searchKey?: string; title?: string; emptyText?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const errText = useErrorText();
  const download = useDownload();
  const refreshAll = useRefreshDrive();
  const { react } = useMascot();

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<{ by: Sort; order: 'asc' | 'desc' }>({ by: 'name', order: 'asc' });
  useEffect(() => {
    setView(readPref('ain-view', 'grid') === 'list' ? 'list' : 'grid');
    const [by, order] = readPref('ain-sort', 'name:asc').split(':');
    setSort({ by: (by as Sort) ?? 'name', order: order === 'desc' ? 'desc' : 'asc' });
  }, []);

  const key =
    mode === 'folder'
      ? `/drive?${new URLSearchParams({ ...(folderId ? { folderId } : {}), sort: sort.by, order: sort.order })}`
      : mode === 'recent'
        ? '/drive/recent'
        : mode === 'starred'
          ? '/drive/starred'
          : searchKey ?? null;

  const { data, error, isLoading, mutate } = useSWR<Partial<DriveListing>>(key, {
    // Пока что-то проверяется или обрабатывается — обновляем список, чтобы состояние было актуальным
    refreshInterval: (d) => ((d?.assets ?? []).some(isBusy) ? 2500 : 0),
    keepPreviousData: true,
  });

  const folders = useMemo(() => data?.folders ?? [], [data]);
  const assets = useMemo(() => data?.assets ?? [], [data]);
  const items: Item[] = useMemo(() => [...folders, ...assets], [folders, assets]);
  const empty = !isLoading && !error && data && items.length === 0;
  const notFound = error instanceof ApiError && error.status === 404;

  // Маскот: пустая папка → «Ожидание», ошибка/нет доступа → «Растерян», идёт обработка → «Думает»
  const busy = assets.some(isBusy);
  useMascotMood(
    error ? 'confused' : mode === 'search' && isLoading ? 'think' : empty && mode === 'folder' ? 'idle' : busy ? 'think' : null,
    empty && mode === 'folder' ? 'mascot.idle' : undefined,
  );

  // Радость, когда обработка видео/фото завершилась
  const prevStates = useRef(new Map<string, string>());
  useEffect(() => {
    let finished = false;
    for (const a of assets) {
      const prev = prevStates.current.get(a.id);
      if (prev && prev !== 'READY' && a.processing === 'READY') finished = true;
      prevStates.current.set(a.id, a.processing);
    }
    if (finished) react('happy', 3500, t('mascot.happy'));
  }, [assets, react, t]);

  // ---------- выделение ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  useEffect(() => setSelected(new Set()), [key]);
  const onSelect = useCallback(
    (item: Item, e: React.MouseEvent) => {
      const idx = items.findIndex((i) => itemKey(i) === itemKey(item));
      setSelected((cur) => {
        const next = new Set(cur);
        if (e.shiftKey && lastClicked.current !== null) {
          const [a, b] = [Math.min(lastClicked.current, idx), Math.max(lastClicked.current, idx)];
          for (let i = a; i <= b; i++) next.add(itemKey(items[i]));
        } else if (next.has(itemKey(item))) next.delete(itemKey(item));
        else next.add(itemKey(item));
        return next;
      });
      lastClicked.current = idx;
    },
    [items],
  );
  const selectedItems = items.filter((i) => selected.has(itemKey(i)));
  const split = (list: Item[]) => ({
    assetIds: list.filter((i) => i.type === 'asset').map((i) => i.id),
    folderIds: list.filter((i) => i.type === 'folder').map((i) => i.id),
  });

  // ---------- действия ----------
  const [renaming, setRenaming] = useState<Item | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [moving, setMoving] = useState<Item[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState<Item[] | null>(null);
  const [ctx, setCtx] = useState<{ item: Item; x: number; y: number } | null>(null);
  const closeCtx = useCallback(() => setCtx(null), []);

  // Палитра и клавиши U / N работают с открытой папкой
  useEffect(() => {
    if (mode !== 'folder') return;
    return driveBus.register({ folderId: folderId ?? null, newFolder: () => setCreating(true) });
  }, [mode, folderId]);

  const bulk = async (action: 'move' | 'trash' | 'star' | 'unstar', list: Item[], targetFolderId?: string | null) => {
    await api('/assets/bulk', { method: 'POST', body: { action, ...split(list), targetFolderId } });
    setSelected(new Set());
    await refreshAll();
  };

  const onAction = (a: ItemAction, item: Item) => {
    switch (a) {
      case 'open':
        router.push(itemHref(item));
        break;
      case 'download':
        void download(item as AssetCard);
        break;
      case 'share':
        setSharing(item);
        break;
      case 'rename':
        setRenaming(item);
        break;
      case 'move':
        setMoving([item]);
        break;
      case 'star':
        void bulk(item.starred ? 'unstar' : 'star', [item]).catch((e) => toast(errText(e), 'error'));
        break;
      case 'trash':
        setConfirmTrash([item]);
        break;
    }
  };

  // Клавиатура: Esc — снять выделение, Delete — в корзину
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return;
      if (e.key === 'Escape') setSelected(new Set());
      if (e.key === 'Delete' && selectedItems.length) setConfirmTrash(selectedItems);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItems]);

  // ---------- загрузка ----------
  const filesRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const canUpload = mode === 'folder' && !error;
  const enqueue = (entries: { file: File; path: string[] }[]) => {
    if (entries.length) void getUploadManager().add(entries, folderId);
  };

  const dropHandlers = canUpload
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        },
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          enqueue(await filesFromDrop(e.dataTransfer));
        },
      }
    : {};

  const folderName = data?.folder?.name ?? t('common.root');

  return (
    <div className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col px-3 py-4 sm:px-6" {...dropHandlers}>
      {mode === 'folder' && !folderId && <Greeting />}
      {/* Панель: цепочка, загрузка, создание папки, вид и сортировка */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          {mode === 'folder' ? <Breadcrumbs path={data?.path ?? []} /> : <h1 className="text-lg font-semibold">{title}</h1>}
        </div>
        {canUpload && (
          <>
            <input ref={filesRef} type="file" multiple className="hidden" onChange={(e) => { enqueue(filesFromInput(e.target.files).map((x) => ({ ...x, path: [] }))); e.target.value = ''; }} />
            <input
              ref={dirRef}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => {
                enqueue(filesFromInput(e.target.files));
                e.target.value = '';
              }}
            />
            <Menu
              align="right"
              label={t('drive.upload')}
              trigger={({ toggle }) => (
                <Button variant="primary" onClick={toggle}>
                  <Upload className="size-4" />
                  {t('drive.upload')}
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={<CloudUpload />} onClick={() => { close(); filesRef.current?.click(); }}>
                    {t('drive.uploadFiles')}
                  </MenuItem>
                  <MenuItem icon={<FolderUp />} onClick={() => { close(); dirRef.current?.click(); }}>
                    {t('drive.uploadFolder')}
                  </MenuItem>
                </>
              )}
            </Menu>
            <Button onClick={() => setCreating(true)}>
              <FolderPlus className="size-4" />
              <span className="hidden sm:inline">{t('drive.newFolder')}</span>
            </Button>
          </>
        )}
        {mode === 'folder' && (
          <select
            aria-label={t('drive.sortBy')}
            value={`${sort.by}:${sort.order}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split(':');
              setSort({ by: by as Sort, order: order as 'asc' | 'desc' });
              writePref('ain-sort', e.target.value);
            }}
            className="h-10 rounded-lg glass-2 px-2 text-sm"
          >
            <option value="name:asc">{t('drive.sortName')}</option>
            <option value="createdAt:desc">{t('drive.sortDate')}</option>
            <option value="size:desc">{t('drive.sortSize')}</option>
            <option value="kind:asc">{t('drive.sortKind')}</option>
            <option value="takenAt:desc">{t('drive.sortTaken')}</option>
          </select>
        )}
        <div className="flex rounded-lg border border-border p-0.5">
          <IconButton label={t('drive.grid')} active={view === 'grid'} className="size-8" onClick={() => { setView('grid'); writePref('ain-view', 'grid'); }}>
            <LayoutGrid className="size-4" />
          </IconButton>
          <IconButton label={t('drive.list')} active={view === 'list'} className="size-8" onClick={() => { setView('list'); writePref('ain-view', 'list'); }}>
            <List className="size-4" />
          </IconButton>
        </div>
      </div>

      {isLoading && !data ? (
        <Skeleton view={view} />
      ) : error ? (
        notFound ? (
          <EmptyState mood="confused" title={t('common.noAccess')} text={t('common.noAccessText')} action={<Button onClick={() => router.push('/drive')}>{t('common.toDrive')}</Button>} />
        ) : (
          <EmptyState mood="confused" title={t('common.unknownError')} text={errText(error)} action={<Button onClick={() => mutate()}>{t('common.retry')}</Button>} />
        )
      ) : empty ? (
        <EmptyState
          mood="idle"
          title={mode === 'folder' ? t('drive.emptyTitle') : mode === 'search' ? t('search.nothing') : title ?? ''}
          text={emptyText ?? (mode === 'search' ? t('search.nothingText') : t('drive.emptyText'))}
          action={canUpload ? <Button variant="primary" onClick={() => filesRef.current?.click()}><Upload className="size-4" />{t('drive.upload')}</Button> : undefined}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {items.map((i) => (
            <ItemCard key={itemKey(i)} item={i} selected={selected.has(itemKey(i))} anySelected={selected.size > 0} onSelect={onSelect} onAction={onAction} onContext={(item, e) => setCtx({ item, x: e.clientX, y: e.clientY })} />
          ))}
        </div>
      ) : (
        <div role="table" className="overflow-hidden rounded-xl border border-border">
          <div role="row" className="hidden grid-cols-[auto_minmax(0,1fr)_110px_100px_130px_auto] gap-3 border-b border-border bg-surface px-3 py-2 text-xs font-medium text-muted sm:grid">
            <span className="w-6" />
            <span>{t('drive.name')}</span>
            <span>{t('drive.type')}</span>
            <span>{t('drive.size')}</span>
            <span>{t('drive.added')}</span>
            <span className="w-8" />
          </div>
          {items.map((i) => (
            <ItemRow key={itemKey(i)} item={i} selected={selected.has(itemKey(i))} anySelected={selected.size > 0} onSelect={onSelect} onAction={onAction} onContext={(item, e) => setCtx({ item, x: e.clientX, y: e.clientY })} />
          ))}
        </div>
      )}

      {dragging && (
        <div className="glass-strong pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed !border-accent">
          <CloudUpload className="size-10 text-accent" />
          <p className="text-lg font-semibold">{t('drive.dropHere')}</p>
          <p className="text-sm text-muted">{t('drive.dropTarget', { folder: folderName })}</p>
        </div>
      )}

      {selectedItems.length > 0 && (
        <div data-mascot-avoid className="animate-pop fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl glass-strong p-1.5 pl-4">
          <span className="mr-2 text-sm font-medium">{t('common.selected', { n: selectedItems.length })}</span>
          <IconButton label={t('common.move')} onClick={() => setMoving(selectedItems)}>
            <FolderInput className="size-4" />
          </IconButton>
          <IconButton label={t('common.star')} onClick={() => void bulk('star', selectedItems).catch((e) => toast(errText(e), 'error'))}>
            <Star className="size-4" />
          </IconButton>
          <IconButton label={t('common.delete')} onClick={() => setConfirmTrash(selectedItems)}>
            <Trash2 className="size-4" />
          </IconButton>
          <IconButton label={t('common.clearSelection')} onClick={() => setSelected(new Set())}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      <ItemContextMenu state={ctx} onClose={closeCtx} onAction={onAction} />
      <ShareDialog
        target={sharing ? { name: sharing.name, ...(sharing.type === 'folder' ? { folderId: sharing.id } : { assetId: sharing.id }) } : null}
        onClose={() => setSharing(null)}
      />
      <NameDialog
        open={creating}
        title={t('drive.newFolder')}
        label={t('drive.folderName')}
        initial={t('drive.newFolderDefault')}
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          await api('/folders', { method: 'POST', body: { name, parentId: folderId } });
          await mutate();
        }}
      />
      <NameDialog
        open={!!renaming}
        title={t('drive.renameTitle')}
        label={t('drive.name')}
        initial={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (!renaming) return;
          await api(renaming.type === 'folder' ? `/folders/${renaming.id}` : `/assets/${renaming.id}`, { method: 'PATCH', body: { name } });
          await refreshAll();
        }}
      />
      <MoveDialog
        open={!!moving}
        onClose={() => setMoving(null)}
        excludeIds={(moving ?? []).filter((i) => i.type === 'folder').map((i) => i.id)}
        onMove={async (target) => {
          if (moving) await bulk('move', moving, target);
        }}
      />
      <Modal
        open={!!confirmTrash}
        onClose={() => setConfirmTrash(null)}
        title={t('common.delete')}
        footer={
          <>
            <Button onClick={() => setConfirmTrash(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={async () => {
                const list = confirmTrash ?? [];
                setConfirmTrash(null);
                try {
                  await bulk('trash', list);
                  toast(t('drive.movedToTrash'), 'success');
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
        <ul className="mt-3 max-h-40 overflow-y-auto text-sm">
          {(confirmTrash ?? []).slice(0, 20).map((i) => (
            <li key={itemKey(i)} className="truncate">
              {i.name}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function Breadcrumbs({ path }: { path: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const crumbs = [{ id: null as string | null, name: t('common.root') }, ...path];
  return (
    <nav aria-label="Путь" className="flex min-w-0 items-center gap-1 text-lg">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.id ?? 'root'} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-4 shrink-0 text-subtle" />}
            {last ? (
              <h1 className="truncate font-semibold" title={c.name} aria-current="page">
                {c.name}
              </h1>
            ) : (
              <Link href={c.id ? `/drive/folder/${c.id}` : '/drive'} className="truncate text-muted hover:text-fg" title={c.name}>
                {c.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Приветствие по времени суток и короткая сводка хранилища на корневой странице «Мои файлы» */
function Greeting() {
  const { t, locale } = useI18n();
  const { user, me } = useSession();
  const [hour, setHour] = useState<number | null>(null);
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    setHour(new Date().getHours());
    setMod(isMac() ? '⌘' : 'Ctrl');
  }, []);
  if (!user || hour === null) return <div className="h-[76px]" />;
  const key = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : hour < 23 ? 'evening' : 'night';
  const name = user.name.split(' ')[0];
  const chips = [
    me?.stats ? t('greeting.files', { n: me.stats.files }) : null,
    me?.stats ? t('greeting.folders', { n: me.stats.folders }) : null,
    me?.usage ? t('greeting.storage', { used: formatBytes(me.usage.usedBytes, locale), total: formatBytes(me.usage.quotaBytes, locale) }) : null,
    me?.stats?.processing ? t('greeting.processing', { n: me.stats.processing }) : null,
  ].filter(Boolean) as string[];
  const [before, after] = t('greeting.tip', { key: '\u0000' }).split('\u0000');
  return (
    <div className="animate-fade-up mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-gradient text-2xl font-semibold tracking-tight sm:text-3xl">{t(`greeting.${key}` as 'greeting.day', { name })}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="glass rounded-full px-2.5 py-1 text-xs text-muted">
              {c}
            </span>
          ))}
        </div>
      </div>
      <p className="hidden items-center gap-1 text-xs text-subtle md:flex">
        {before}
        <kbd>{mod}</kbd>
        <kbd>K</kbd>
        {after}
      </p>
    </div>
  );
}

export function EmptyState({ mood, title, text, action }: { mood: 'idle' | 'confused' | 'sleep'; title: string; text: string; action?: ReactNode }) {
  // Когда живой Барыс на экране, плоская картинка не дублирует его
  const mascot = useMascotOptional();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      {mascot?.mode !== 'ON' && <BarysIcon size={88} mood={mood} />}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function Skeleton({ view }: { view: 'grid' | 'list' }) {
  return view === 'grid' ? (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border">
          <div className="skeleton aspect-video" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3.5 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="size-6" />
    </div>
  );
}
