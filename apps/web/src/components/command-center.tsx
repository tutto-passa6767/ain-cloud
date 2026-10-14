'use client';

import clsx from 'clsx';
import {
  Clock,
  CloudUpload,
  CornerDownLeft,
  File as FileIcon,
  FolderPlus,
  HardDrive,
  House,
  Keyboard,
  Languages,
  Minimize2,
  Moon,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  CircleHelp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LOCALES, useI18n, type Locale } from '@/i18n';
import { api } from '@/lib/api';
import { driveBus } from '@/lib/drive-bus';
import { filesFromInput, getUploadManager } from '@/lib/uploader/react';
import { useMascot } from './mascot/mascot-context';
import { useSession } from './providers';

interface Commands {
  openPalette: () => void;
  openHotkeys: () => void;
  openUpload: () => void;
}

const CommandsContext = createContext<Commands | null>(null);
export const useCommands = () => useContext(CommandsContext);

interface Cmd {
  id: string;
  group: 'go' | 'actions' | 'files';
  label: string;
  icon: ReactNode;
  keywords?: string;
  shortcut?: string[];
  run: () => void;
}

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e?.closest?.('input, textarea, select, [contenteditable="true"]');
};

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Командный центр рабочей части: палитра (Ctrl/⌘+K), шпаргалка (?), загрузка (U), новая папка (N),
 * переходы «G, затем …». Клавиши не срабатывают, пока курсор в поле ввода.
 */
export function CommandCenter({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [hotkeys, setHotkeys] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openUpload = useCallback(() => fileRef.current?.click(), []);
  const value = useMemo<Commands>(() => ({ openPalette: () => setPalette(true), openHotkeys: () => setHotkeys(true), openUpload }), [openUpload]);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHotkeys(false);
        setPalette((p) => !p);
        return;
      }
      if (mod || e.altKey || typing(e.target) || document.body.dataset.modalOpen === '1') return;
      // Последовательность «G, затем буква» — переходы между разделами
      if (Date.now() - gAt < 1200) {
        const to: Record<string, string> = { h: '/', d: '/drive', r: '/recent', s: '/starred', t: '/trash' };
        const href = to[e.key.toLowerCase()];
        gAt = 0;
        if (href) {
          e.preventDefault();
          router.push(href);
          return;
        }
      }
      switch (e.key) {
        case '?':
          e.preventDefault();
          setHotkeys(true);
          break;
        case '/': {
          const input = document.querySelector<HTMLInputElement>('input[data-global-search]');
          if (input) {
            e.preventDefault();
            input.focus();
          }
          break;
        }
        case 'u':
        case 'U':
          e.preventDefault();
          openUpload();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          driveBus.newFolder((href) => router.push(href));
          break;
        case 'g':
        case 'G':
          gAt = Date.now();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, openUpload]);

  return (
    <CommandsContext.Provider value={value}>
      {children}
      {/* Общий выбор файлов: из палитры и по клавише U файлы уходят в открытую папку */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const entries = filesFromInput(e.target.files).map((x) => ({ ...x, path: [] }));
          if (entries.length) void getUploadManager().add(entries, driveBus.currentFolder());
          e.target.value = '';
        }}
      />
      {palette && <Palette onClose={() => setPalette(false)} onHotkeys={() => { setPalette(false); setHotkeys(true); }} onUpload={openUpload} />}
      {hotkeys && <Hotkeys onClose={() => setHotkeys(false)} />}
    </CommandsContext.Provider>
  );
}

function Overlay({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    document.body.dataset.modalOpen = '1';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      delete document.body.dataset.modalOpen;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start justify-center bg-overlay px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}

function Palette({ onClose, onHotkeys, onUpload }: { onClose: () => void; onHotkeys: () => void; onUpload: () => void }) {
  const { t, setLocale, locale } = useI18n();
  const router = useRouter();
  const { user, theme, setTheme } = useSession();
  const mascot = useMascot();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ type: 'asset' | 'tag'; id?: string; label: string }[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  // Файлы — из тех же подсказок поиска (только свои)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setFound([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api<{ items: typeof found }>(`/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => setFound(r.items))
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const go = useCallback((href: string) => () => router.push(href), [router]);
  const all = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [
      { id: 'home', group: 'go', label: t('nav.home'), icon: <House />, shortcut: ['G', 'H'], run: go('/') },
      { id: 'drive', group: 'go', label: t('nav.drive'), icon: <HardDrive />, shortcut: ['G', 'D'], run: go('/drive') },
      { id: 'recent', group: 'go', label: t('nav.recent'), icon: <Clock />, shortcut: ['G', 'R'], run: go('/recent') },
      { id: 'starred', group: 'go', label: t('nav.starred'), icon: <Star />, shortcut: ['G', 'S'], run: go('/starred') },
      { id: 'uploads', group: 'go', label: t('nav.uploads'), icon: <CloudUpload />, run: go('/uploads') },
      { id: 'trash', group: 'go', label: t('nav.trash'), icon: <Trash2 />, shortcut: ['G', 'T'], run: go('/trash') },
      { id: 'settings', group: 'go', label: t('nav.settings'), icon: <Settings />, run: go('/settings') },
      { id: 'help', group: 'go', label: t('nav.help'), icon: <CircleHelp />, run: go('/help') },
      ...(user && user.role !== 'USER' ? [{ id: 'admin', group: 'go' as const, label: t('nav.admin'), icon: <Shield />, run: go('/admin') }] : []),
      { id: 'upload', group: 'actions', label: t('palette.upload'), icon: <CloudUpload />, shortcut: ['U'], keywords: 'upload загрузить жүктеу', run: onUpload },
      { id: 'folder', group: 'actions', label: t('palette.newFolder'), icon: <FolderPlus />, shortcut: ['N'], keywords: 'folder папка қалта', run: () => driveBus.newFolder((h) => router.push(h)) },
      { id: 'theme', group: 'actions', label: t('palette.theme'), icon: <Moon />, keywords: 'theme dark light тема тақырып', run: () => setTheme(theme === 'DARK' ? 'LIGHT' : 'DARK') },
      ...LOCALES.filter((l) => l.code !== locale).map((l) => ({
        id: `lang-${l.code}`,
        group: 'actions' as const,
        label: t('palette.lang', { l: l.label }),
        icon: <Languages />,
        keywords: 'language язык тіл',
        run: () => setLocale(l.code as Locale),
      })),
      mascot.mode === 'ON'
        ? { id: 'mascot', group: 'actions', label: t('palette.mascotHide'), icon: <Minimize2 />, keywords: 'облачко бұлт cloudy маскот mascot', run: () => mascot.setMode('COLLAPSED') }
        : { id: 'mascot', group: 'actions', label: t('palette.mascotCall'), icon: <Sparkles />, keywords: 'облачко бұлт cloudy маскот mascot', run: () => mascot.setMode('ON') },
      { id: 'hotkeys', group: 'actions', label: t('palette.hotkeys'), icon: <Keyboard />, shortcut: ['?'], keywords: 'keys клавиши пернелер', run: onHotkeys },
    ];
    const term = q.trim().toLowerCase();
    const matched = term ? cmds.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(term)) : cmds;
    const files: Cmd[] = found.map((f, i) => ({
      id: `f-${i}`,
      group: 'files',
      label: f.type === 'tag' ? `#${f.label}` : f.label,
      icon: f.type === 'tag' ? <Search /> : <FileIcon />,
      run: f.type === 'asset' && f.id ? go(`/drive/file/${f.id}`) : go(`/search?q=${encodeURIComponent(f.label)}`),
    }));
    if (term) files.push({ id: 'search-all', group: 'files', label: t('palette.searchAll', { q: q.trim() }), icon: <Search />, run: go(`/search?q=${encodeURIComponent(q.trim())}`) });
    return [...matched, ...files];
  }, [t, go, user, onUpload, router, setTheme, theme, locale, setLocale, mascot, onHotkeys, q, found]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  // Совпавшие команды выше файлов; если команд нет — первыми оказываются файлы
  const groups: { key: Cmd['group']; title: string }[] = [
    { key: 'go', title: t('palette.go') },
    { key: 'actions', title: t('palette.actions') },
    { key: 'files', title: t('palette.files') },
  ];
  // Порядок отображения совпадает с порядком навигации стрелками
  const ordered = groups.flatMap((g) => all.filter((c) => c.group === g.key));

  return (
    <Overlay onClose={onClose} label={t('palette.open')}>
      <div className="glass-strong animate-pop w-full max-w-xl overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(ordered.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(ordered[active]);
              }
            }}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            className="h-14 flex-1 bg-transparent text-base placeholder:text-subtle"
            style={{ outline: 'none' }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
          {ordered.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{t('palette.empty')}</li>}
          {groups.map((g) => {
            const items = ordered.filter((c) => c.group === g.key);
            if (!items.length) return null;
            return (
              <li key={g.key} role="presentation">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.title}</p>
                <ul role="presentation">
                  {items.map((c) => {
                    const index = ordered.indexOf(c);
                    return (
                      <li key={c.id} role="option" aria-selected={index === active} data-index={index}>
                        <button
                          type="button"
                          onMouseMove={() => setActive(index)}
                          onClick={() => run(c)}
                          className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors', index === active ? 'bg-accent-soft text-fg' : 'text-fg/90')}
                        >
                          <span className={clsx('[&>svg]:size-4', index === active ? 'text-accent' : 'text-subtle')}>{c.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{c.label}</span>
                          {c.shortcut && (
                            <span className="flex gap-1">
                              {c.shortcut.map((k) => (
                                <kbd key={k}>{k}</kbd>
                              ))}
                            </span>
                          )}
                          {index === active && <CornerDownLeft className="size-3.5 text-subtle" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2 text-xs text-subtle">{t('palette.hint')}</p>
      </div>
    </Overlay>
  );
}

function Hotkeys({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const mod = isMac() ? '⌘' : 'Ctrl';
  const sections: { title: string; rows: [string[], string][] }[] = [
    {
      title: t('hotkeys.general'),
      rows: [
        [[mod, 'K'], t('hotkeys.palette')],
        [['/'], t('hotkeys.search')],
        [['U'], t('hotkeys.upload')],
        [['N'], t('hotkeys.newFolder')],
        [['G', 'H'], t('hotkeys.goHome')],
        [['G', 'D'], t('hotkeys.goDrive')],
        [['G', 'R'], t('hotkeys.goRecent')],
        [['G', 'S'], t('hotkeys.goStarred')],
        [['G', 'T'], t('hotkeys.goTrash')],
        [['?'], t('hotkeys.help')],
      ],
    },
    {
      title: t('hotkeys.drive'),
      rows: [
        [[mod, t('hotkeys.click')], t('hotkeys.select')],
        [['Shift', t('hotkeys.click')], t('hotkeys.range')],
        [[t('hotkeys.rightClick')], t('hotkeys.context')],
        [['Delete'], t('hotkeys.delete')],
        [['Esc'], t('hotkeys.clear')],
      ],
    },
    {
      title: t('hotkeys.player'),
      rows: [
        [['Space'], t('hotkeys.play')],
        [['←', '→', 'J', 'L'], t('hotkeys.seek')],
        [['↑', '↓'], t('hotkeys.volume')],
        [['F'], t('hotkeys.fullscreen')],
        [['M'], t('hotkeys.mute')],
      ],
    },
  ];
  return (
    <Overlay onClose={onClose} label={t('hotkeys.title')}>
      <div className="glass-strong animate-pop w-full max-w-2xl overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Keyboard className="size-5 text-accent" />
          <h2 className="flex-1 text-base font-semibold">{t('hotkeys.title')}</h2>
          <kbd>Esc</kbd>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          {sections.map((s) => (
            <section key={s.title} className={clsx(s === sections[0] && 'sm:row-span-2')}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{s.title}</h3>
              <dl className="flex flex-col gap-2">
                {s.rows.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && keys[0] === 'G' && <span className="text-[10px] text-subtle">{t('hotkeys.then')}</span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
