'use client';

import clsx from 'clsx';
import { LoaderCircle, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }>(
  function Button({ variant = 'secondary', loading, size = 'md', className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
          size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
          variant === 'primary' && 'bg-accent text-accent-fg shadow-[0_10px_30px_-12px_var(--accent)] hover:bg-accent-strong hover:shadow-[0_12px_34px_-10px_var(--accent)]',
          variant === 'secondary' && 'glass-2 text-fg hover:bg-surface-3',
          variant === 'ghost' && 'text-fg hover:bg-surface-2',
          variant === 'danger' && 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
          className,
        )}
        {...rest}
      >
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }>(
  function IconButton({ label, active, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={clsx(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40',
          active && 'bg-surface-2 text-fg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string | null }>(
  function Input({ label, hint, error, className, id, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={hint || error ? `${inputId}-hint` : undefined}
          className={clsx(
            'h-10 rounded-lg border bg-bg-elevated px-3 text-sm text-fg placeholder:text-subtle outline-none transition-colors focus:border-accent',
            error ? 'border-danger' : 'border-border',
            className,
          )}
          {...rest}
        />
        {(hint || error) && (
          <p id={`${inputId}-hint`} className={clsx('text-xs', error ? 'text-danger' : 'text-muted')}>
            {error || hint}
          </p>
        )}
      </div>
    );
  },
);

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin text-muted', className ?? 'size-5')} aria-hidden />;
}

export function Badge({ tone = 'neutral', children, className, title }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none',
        tone === 'neutral' && 'bg-surface-3 text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Модальное окно: фокус внутри, Esc закрывает, фон затемнён. Помечено для маскота как рабочая зона. */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Модальное окно скрытой (Activity) страницы закрывается при уходе со страницы
  useLayoutEffect(() => () => onCloseRef.current?.(), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>('input, textarea, select, button[data-autofocus], button:not([aria-label])');
    focusable?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && node) {
        const els = [...node.querySelectorAll<HTMLElement>('a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.dataset.modalOpen = '1';
    return () => {
      document.removeEventListener('keydown', onKey);
      delete document.body.dataset.modalOpen;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-mascot-avoid>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx('animate-pop flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl glass-strong', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Выпадающее меню, закрывается по клику снаружи, Esc и при уходе со страницы */
export function Menu({ trigger, children, align = 'right', label }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useLayoutEffect(() => () => setOpen(false), []);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={clsx('animate-pop absolute z-40 mt-1 min-w-52 overflow-hidden rounded-xl glass-strong p-1', align === 'right' ? 'right-0' : 'left-0')}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-40',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      {children}
    </button>
  );
}

export function ProgressBar({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'success' | 'warning' | 'danger'; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={clsx('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={clsx(
          'h-full rounded-full transition-[width] duration-300',
          tone === 'accent' && 'bg-accent',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'danger' && 'bg-danger',
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/** Длинное имя обрезается, полное — во всплывающей подсказке (ТЗ §12) */
export function TruncatedName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={clsx('block truncate', className)} title={name}>
      {name}
    </span>
  );
}
