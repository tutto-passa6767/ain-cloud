'use client';

import clsx from 'clsx';
import { Clock, CloudUpload, HardDrive, House, LogOut, Menu as MenuIcon, Moon, Search, Settings, Shield, Star, Sun, Trash2, CircleHelp, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSWRConfig } from 'swr';
import { LOCALES, useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { getUploadManager, useUploads } from '@/lib/uploader/react';
import { MascotOverlay } from './mascot/mascot-overlay';
import { MascotProvider, useMascot } from './mascot/mascot-context';
import { CloudIcon } from './mascot/cloud-icon';
import { useSession } from './providers';
import { useToast } from './toast';
import { IconButton, Menu, MenuItem, ProgressBar, Spinner } from './ui';
import { UploadPanel } from './upload-panel';
import { CommandCenter, isMac, useCommands } from './command-center';
import { confetti } from '@/lib/confetti';

const NAV = [
  { href: '/drive', icon: HardDrive, key: 'nav.drive' },
  { href: '/recent', icon: Clock, key: 'nav.recent' },
  { href: '/starred', icon: Star, key: 'nav.starred' },
  { href: '/uploads', icon: CloudUpload, key: 'nav.uploads' },
  { href: '/trash', icon: Trash2, key: 'nav.trash' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!user.emailVerifiedAt) router.replace('/verify');
  }, [loading, user, router, pathname]);

  if (!user || !user.emailVerifiedAt) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  return (
    <MascotProvider>
      <CommandCenter>
        <Shell>{children}</Shell>
      </CommandCenter>
    </MascotProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const { mode } = useMascot();
  useEffect(() => setDrawer(false), [pathname]);
  return (
    <>
      <UploadBridge />
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 glass border-y-0 border-l-0 lg:block">
          <Sidebar />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-overlay" onClick={() => setDrawer(false)} />
            <aside className="animate-pop absolute inset-y-0 left-0 w-72 glass border-y-0 border-l-0">
              <Sidebar onClose={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setDrawer(true)} />
          {/* Нижний отступ: содержимое всегда можно прокрутить выше маскота — он не закрывает файлы */}
          <main id="main" className={clsx('flex-1', mode === 'ON' ? 'pb-60' : 'pb-24')}>
            {children}
          </main>
        </div>
      </div>
      <UploadPanel />
      <MascotOverlay />
    </>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const pathname = usePathname();
  const usage = me?.usage;
  const pct = usage ? ((usage.usedBytes + usage.reservedBytes) / Math.max(1, usage.quotaBytes)) * 100 : 0;
  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Навигация">
      <div className="mb-3 flex items-center justify-between px-2 py-1">
        <Link href="/" className="flex items-center gap-2 font-semibold" title={t('nav.home')}>
          <CloudIcon size={28} />
          <span>AIN Cloud</span>
        </Link>
        {onClose && (
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>
      {/* Главная страница сервиса доступна и из аккаунта */}
      <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg">
        <House className="size-4" />
        {t('nav.home')}
      </Link>
      {NAV.map(({ href, icon: Icon, key }) => {
        const active = pathname === href || (href === '/drive' && pathname.startsWith('/drive'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-gradient-to-r from-accent-soft to-transparent font-medium text-fg shadow-[inset_2px_0_0_var(--accent-solid)]' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Icon className="size-4" />
            {t(key)}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1">
        {usage && (
          <div className="mb-2 rounded-xl glass p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">{t('nav.storage')}</span>
              <span className="text-muted">{me?.plan?.name}</span>
            </div>
            <ProgressBar value={pct} tone={pct > 90 ? 'danger' : pct > 75 ? 'warning' : 'accent'} label={t('nav.storage')} />
            <p className="mt-2 text-xs text-muted">
              {t('nav.usedOf', { used: formatBytes(usage.usedBytes + usage.reservedBytes, locale), total: formatBytes(usage.quotaBytes, locale) })}
            </p>
          </div>
        )}
        {me?.user && me.user.role !== 'USER' && (
          <Link href="/admin" className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', pathname.startsWith('/admin') ? 'bg-gradient-to-r from-accent-soft to-transparent font-medium text-fg shadow-[inset_2px_0_0_var(--accent-solid)]' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
            <Shield className="size-4" />
            {t('nav.admin')}
          </Link>
        )}
        <Link href="/settings" className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', pathname === '/settings' ? 'bg-gradient-to-r from-accent-soft to-transparent font-medium text-fg shadow-[inset_2px_0_0_var(--accent-solid)]' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
          <Settings className="size-4" />
          {t('nav.settings')}
        </Link>
        <Link href="/help" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          <CircleHelp className="size-4" />
          {t('nav.help')}
        </Link>
      </div>
    </nav>
  );
}

export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="group" aria-label={t('common.language')} className="flex rounded-full border border-border p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          onClick={() => setLocale(l.code)}
          aria-pressed={locale === l.code}
          title={l.label}
          className={clsx('rounded-full px-2 py-1 text-xs font-semibold transition-colors', locale === l.code ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg', compact && 'px-1.5')}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useSession();
  const { t } = useI18n();
  return (
    <IconButton label={`${t('common.theme')}: ${theme === 'DARK' ? t('common.dark') : t('common.light')}`} onClick={() => setTheme(theme === 'DARK' ? 'LIGHT' : 'DARK')}>
      {theme === 'DARK' ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </IconButton>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 glass border-x-0 border-t-0 px-3 sm:px-5">
      <IconButton label="Меню" className="lg:hidden" onClick={onMenu}>
        <MenuIcon className="size-5" />
      </IconButton>
      <SearchBox />
      <PaletteButton />
      <div className="ml-auto flex items-center gap-1.5">
        <div className="hidden sm:block">
          <LanguageSwitch />
        </div>
        <ThemeToggle />
        <Menu
          label={user?.name}
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="flex size-9 items-center justify-center rounded-full bg-[linear-gradient(160deg,#ff6a1a,#e61e32)] text-sm font-semibold text-white shadow-[0_6px_18px_-6px_rgba(230,30,50,0.8)]" aria-label={user?.name}>
              {(user?.name ?? '?').slice(0, 1).toUpperCase()}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="border-b border-border px-2.5 pb-2 pt-1.5">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
              <div className="px-1.5 py-2 sm:hidden">
                <LanguageSwitch compact />
              </div>
              <MenuItem icon={<House />} onClick={() => { close(); router.push('/'); }}>
                {t('nav.home')}
              </MenuItem>
              <MenuItem icon={<Settings />} onClick={() => { close(); router.push('/settings'); }}>
                {t('nav.settings')}
              </MenuItem>
              <MenuItem
                icon={<LogOut />}
                onClick={async () => {
                  close();
                  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
                  window.location.href = '/login';
                }}
              >
                {t('nav.logout')}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

/** Кнопка командной палитры с подсказкой сочетания клавиш */
function PaletteButton() {
  const { t } = useI18n();
  const commands = useCommands();
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => setMod(isMac() ? '⌘' : 'Ctrl'), []);
  return (
    <button
      type="button"
      onClick={() => commands?.openPalette()}
      title={t('palette.open')}
      aria-label={t('palette.open')}
      className="hidden h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 text-muted transition-colors hover:border-border-strong hover:text-fg md:flex"
    >
      <kbd>{mod}</kbd>
      <kbd>K</kbd>
    </button>
  );
}

function SearchBox() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ type: 'asset' | 'tag'; id?: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const id = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const r = await api<{ items: typeof items }>(`/search/suggest?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.current.signal });
        setItems(r.items);
        setActive(-1);
      } catch {
        /* отменённый запрос */
      }
    }, 180);
    return () => clearTimeout(id);
  }, [q]);

  const go = (query: string) => {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };
  const pick = (i: (typeof items)[number]) => {
    setOpen(false);
    if (i.type === 'asset' && i.id) router.push(`/drive/file/${i.id}`);
    else go(i.label);
  };

  return (
    <div className="relative w-full max-w-xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) pick(items[active]);
          else if (q.trim()) go(q.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          data-global-search
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(items.length - 1, a + 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(-1, a - 1));
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('common.search')}
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          className="h-9 w-full rounded-full glass-2 pl-9 pr-4 text-sm outline-none placeholder:text-subtle focus:border-accent"
        />
      </form>
      {open && items.length > 0 && (
        <ul role="listbox" className="animate-pop absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl glass-strong p-1">
          {items.map((i, idx) => (
            <li key={`${i.type}-${i.id ?? i.label}`} role="option" aria-selected={idx === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2', idx === active && 'bg-surface-2')}
              >
                {i.type === 'tag' ? <span className="text-xs text-accent">#</span> : <Search className="size-3.5 text-subtle" />}
                <span className="truncate">{i.label}</span>
                {i.type === 'tag' && <span className="ml-auto text-xs text-subtle">{t('search.tag')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LIVE = ['queued', 'preparing', 'uploading', 'completing', 'offline'];

/**
 * Сценарий загрузки для Облачка (ТЗ маскота §8.1): Думает → (обрыв) Злой → (связь вернулась) Думает → Радость.
 * Ошибки и переполнение квоты — «Злой», реплика держится, пока проблема не решена.
 */
function useUploadMascot() {
  const items = useUploads();
  const { setPageMood, say } = useMascot();
  const { t } = useI18n();
  const last = useRef({ key: '', offline: false, live: false, reply: 'uploading' as 'uploading' | 'resumed' });

  useEffect(() => {
    const live = items.filter((i) => LIVE.includes(i.status));
    const offline = live.some((i) => i.status === 'offline');
    const quota = items.find((i) => i.status === 'error' && i.error?.code === 'QUOTA_EXCEEDED');
    const failed = items.find((i) => i.status === 'error' && i.error?.code !== 'QUOTA_EXCEEDED');
    const total = live.reduce((a, i) => a + i.size, 0);
    const percent = total ? Math.floor((live.reduce((a, i) => a + i.transferred, 0) / total) * 100) : 0;
    const lead = live.find((i) => i.status === 'uploading') ?? live[0];

    // Состояние меняем только при смене ситуации, а не на каждый процент
    const [key, mood, text, urgent] = quota
      ? ['quota', 'angry', t('mascot.quota'), true]
      : offline
        ? ['offline', 'angry', t('mascot.offline'), true]
        : failed
          ? [`failed:${failed.key}`, 'angry', t('mascot.uploadFailed', { name: failed.name }), true]
          : live.length
            ? ['think', 'think', undefined, false]
            : ['', null, undefined, false];
    if (key !== last.current.key) setPageMood('upload', mood as 'angry' | 'think' | null, text, urgent);

    if (live.length && lead && !offline) {
      if (last.current.offline) last.current.reply = 'resumed';
      else if (!last.current.live) last.current.reply = 'uploading';
      const reply = last.current.reply === 'resumed' ? t('mascot.resumed', { percent }) : t('mascot.uploading', { name: lead.name, percent });
      const fresh = last.current.offline || !last.current.live;
      say(reply, { source: 'upload-progress', updateOnly: !fresh });
    }
    last.current = { ...last.current, key, offline, live: live.length > 0 };
  }, [items, setPageMood, say, t]);
}

/** Связь менеджера загрузок с интерфейсом: обновление каталога и квоты, реакция маскота, возобновление */
function UploadBridge() {
  const { mutate } = useSWRConfig();
  const { refresh } = useSession();
  const { react } = useMascot();
  const toast = useToast();
  const { t } = useI18n();
  useUploadMascot();

  useEffect(() => {
    const m = getUploadManager();
    let batch: string[] = [];
    const off = m.onCompleted((item) => {
      batch.push(item.name);
      void mutate((key) => typeof key === 'string' && (key.startsWith('/drive') || key.startsWith('/uploads') || key.startsWith('/search')));
      void refresh();
      if (!m.busy) {
        // «Радость» держится 4 секунды, затем «Ожидание» (ТЗ маскота §6)
        react('happy', 4000, batch.length === 1 ? t('mascot.uploaded', { name: batch[0] }) : t('mascot.uploadedMany'));
        batch = [];
        confetti();
        toast(t('upload.allDone'), 'success');
      }
    });
    return () => {
      off();
    };
  }, [mutate, refresh, react, toast, t]);

  // Прерванные загрузки с сервера: их можно продолжить, выбрав тот же файл (ТЗ §6.3)
  useEffect(() => {
    api<{ active: Parameters<ReturnType<typeof getUploadManager>['adoptServerSessions']>[0] }>('/uploads')
      .then((r) => getUploadManager().adoptServerSessions(r.active))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (getUploadManager().busy) {
        e.preventDefault();
        e.returnValue = t('upload.leaveWarning');
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [t]);
  return null;
}
