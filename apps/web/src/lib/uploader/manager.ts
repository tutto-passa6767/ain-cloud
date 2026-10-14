// Менеджер загрузок (ТЗ §6). Файл идёт частями напрямую в хранилище по подписанным ссылкам.
// Прогресс — только по реально переданным байтам (события XHR), никаких таймеров-имитаций.
import { api, ApiError } from '@/lib/api';

export type UploadStatus =
  | 'preparing'
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'offline'
  | 'completing'
  | 'done'
  | 'error'
  | 'canceled'
  | 'needs-file';

export interface UploadItem {
  key: string;
  sessionId?: string;
  assetId?: string;
  name: string;
  size: number;
  folderId: string | null;
  status: UploadStatus;
  /** Байты подтверждённых частей + текущих передач */
  transferred: number;
  hashed: number;
  speed: number;
  eta: number;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  partsCount?: number;
  partsDone?: number;
  expiresAt?: string;
  createdAt: number;
}

interface ServerSession {
  id: string;
  assetId: string;
  folderId: string | null;
  fileName: string;
  size: number;
  lastModified: number;
  firstPartSha256: string;
  partSize: number;
  partsCount: number;
  status: string;
  expiresAt: string;
  parts?: { partNumber: number; size: number; etag: string }[];
}

interface Run {
  file: File;
  session?: ServerSession;
  parallel: number;
  pending: number[];
  done: Set<number>;
  progress: Map<number, number>;
  xhrs: Map<number, XMLHttpRequest>;
  urls: Map<number, { url: string; exp: number }>;
  retries: Map<number, number>;
  hashWorker?: Worker;
  hash?: Promise<string>;
  /** Подсчёт SHA-256 сорвался (например, код воркера не догрузился при обрыве сети) — нужно начать заново */
  hashFailed?: boolean;
  samples: { t: number; bytes: number }[];
  stopped: boolean;
  completing: boolean;
}

/** Хеш первых 64 МиБ — для сверки файла при возобновлении (ТЗ §6.3); не зависит от размера части */
const FIRST_CHUNK = 64 * 1024 * 1024;
const MAX_FILES_AT_ONCE = 2;
const MAX_PART_RETRIES = 6;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

type Listener = () => void;
type CompletedListener = (item: UploadItem) => void;

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let seq = 0;

export class UploadManager {
  private items: UploadItem[] = [];
  private runs = new Map<string, Run>();
  private listeners = new Set<Listener>();
  private completedListeners = new Set<CompletedListener>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private folderCache = new Map<string, Promise<string | null>>();
  parallelParts = 4;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', () => this.onOffline());
      window.addEventListener('online', () => this.onOnline());
    }
  }

  // ---------- подписка для React ----------

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.items;
  onCompleted(l: CompletedListener) {
    this.completedListeners.add(l);
    return () => this.completedListeners.delete(l);
  }

  private emit() {
    this.items = [...this.items];
    this.listeners.forEach((l) => l());
  }

  private patch(key: string, p: Partial<UploadItem>) {
    const i = this.items.findIndex((x) => x.key === key);
    if (i < 0) return;
    this.items[i] = { ...this.items[i], ...p };
    this.emit();
  }

  private item(key: string) {
    return this.items.find((x) => x.key === key);
  }

  get busy() {
    return this.items.some((i) => ['preparing', 'uploading', 'completing', 'queued', 'offline'].includes(i.status));
  }

  // ---------- добавление файлов ----------

  /** Папки из перетаскивания создаются на сервере, структура повторяется (ТЗ §6.1) */
  async add(entries: { file: File; path?: string[] }[], folderId: string | null) {
    for (const { file, path } of entries) {
      const key = `u${Date.now().toString(36)}${(seq++).toString(36)}`;
      this.items.unshift({
        key,
        name: file.name,
        size: file.size,
        folderId,
        status: 'queued',
        transferred: 0,
        hashed: 0,
        speed: 0,
        eta: 0,
        createdAt: Date.now(),
      });
      this.runs.set(key, this.newRun(file));
      (this.runs.get(key) as Run & { path?: string[] }).path = path;
    }
    this.emit();
    this.schedule();
  }

  private newRun(file: File): Run {
    return {
      file,
      parallel: this.parallelParts,
      pending: [],
      done: new Set(),
      progress: new Map(),
      xhrs: new Map(),
      urls: new Map(),
      retries: new Map(),
      samples: [],
      stopped: false,
      completing: false,
    };
  }

  private async resolveFolder(base: string | null, path?: string[]): Promise<string | null> {
    if (!path?.length) return base;
    const cacheKey = `${base ?? 'root'}/${path.join('/')}`;
    if (!this.folderCache.has(cacheKey)) {
      const parent = path.length > 1 ? this.resolveFolder(base, path.slice(0, -1)) : Promise.resolve(base);
      this.folderCache.set(
        cacheKey,
        parent.then((p) => api<{ folderId: string }>('/folders/ensure-path', { method: 'POST', body: { parentId: p, segments: [path[path.length - 1]] } }).then((r) => r.folderId)),
      );
    }
    try {
      return await this.folderCache.get(cacheKey)!;
    } catch (e) {
      this.folderCache.delete(cacheKey);
      throw e;
    }
  }

  private schedule() {
    const active = this.items.filter((i) => ['preparing', 'uploading', 'completing'].includes(i.status)).length;
    let free = MAX_FILES_AT_ONCE - active;
    // Очередь обрабатывается в порядке добавления
    for (const it of [...this.items].reverse()) {
      if (free <= 0) break;
      if (it.status === 'queued') {
        free--;
        void this.start(it.key);
      }
    }
    this.ensureTicker();
  }

  private async start(key: string) {
    const run = this.runs.get(key) as (Run & { path?: string[] }) | undefined;
    const it = this.item(key);
    if (!run || !it) return;
    run.stopped = false;
    this.patch(key, { status: 'preparing', error: undefined });
    try {
      const folderId = await this.resolveFolder(it.folderId, run.path);
      if (!run.session) {
        const firstPartSha256 = await sha256Hex(run.file.slice(0, Math.min(run.file.size, FIRST_CHUNK)));
        if (run.stopped) return;
        const r = await api<{ session: ServerSession; parallelParts: number }>('/uploads', {
          method: 'POST',
          body: {
            fileName: run.file.name,
            size: run.file.size,
            lastModified: Math.floor(run.file.lastModified),
            firstPartSha256,
            mimeType: run.file.type || undefined,
            folderId,
          },
        });
        run.session = r.session;
        run.parallel = r.parallelParts || this.parallelParts;
        this.patch(key, { sessionId: r.session.id, partsCount: r.session.partsCount, partsDone: 0, expiresAt: r.session.expiresAt, folderId });
      }
      this.startHash(key, run);
      const all = Array.from({ length: run.session.partsCount }, (_, i) => i + 1);
      run.pending = all.filter((n) => !run.done.has(n));
      this.patch(key, { status: navigator.onLine ? 'uploading' : 'offline' });
      this.pump(key);
    } catch (e) {
      this.fail(key, e);
    }
  }

  private startHash(key: string, run: Run) {
    if (run.hash && !run.hashFailed) return;
    run.hashWorker?.terminate();
    run.hashFailed = false;
    const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
    run.hashWorker = worker;
    run.hash = new Promise<string>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ type: string; done?: number; sha256?: string; message?: string }>) => {
        if (e.data.type === 'progress') this.patch(key, { hashed: e.data.done ?? 0 });
        if (e.data.type === 'done') {
          resolve(e.data.sha256!);
          worker.terminate();
        }
        if (e.data.type === 'error') {
          reject(new Error(e.data.message));
          worker.terminate();
        }
      };
      worker.onerror = (err) => {
        reject(new Error(err.message));
        worker.terminate();
      };
    });
    run.hash.catch(() => {
      run.hashFailed = true;
    });
    worker.postMessage({ file: run.file });
  }

  // ---------- передача частей ----------

  private pump(key: string) {
    const run = this.runs.get(key);
    const it = this.item(key);
    if (!run || !it || run.stopped || it.status !== 'uploading') return;
    while (run.xhrs.size < run.parallel && run.pending.length) {
      const n = run.pending.shift()!;
      void this.sendPart(key, run, n);
    }
    if (!run.pending.length && run.xhrs.size === 0 && run.done.size === run.session!.partsCount) {
      void this.complete(key, run);
    }
  }

  private async partUrl(run: Run, n: number): Promise<string> {
    const cached = run.urls.get(n);
    if (cached && cached.exp > Date.now()) return cached.url;
    // Подписываем пачкой: текущая часть и несколько следующих
    const batch = [n, ...run.pending.slice(0, 15)].filter((x) => !run.urls.has(x) || run.urls.get(x)!.exp <= Date.now());
    const r = await api<{ urls: Record<string, string>; expiresInSec: number }>(`/uploads/${run.session!.id}/parts`, {
      method: 'POST',
      body: { partNumbers: batch },
    });
    const exp = Date.now() + (r.expiresInSec - 60) * 1000;
    for (const [k, url] of Object.entries(r.urls)) run.urls.set(Number(k), { url, exp });
    return run.urls.get(n)!.url;
  }

  private async sendPart(key: string, run: Run, n: number) {
    const s = run.session!;
    const start = (n - 1) * s.partSize;
    const blob = run.file.slice(start, Math.min(run.file.size, start + s.partSize));
    let url: string;
    const placeholder = new XMLHttpRequest();
    run.xhrs.set(n, placeholder);
    try {
      url = await this.partUrl(run, n);
    } catch (e) {
      run.xhrs.delete(n);
      return this.retryPart(key, run, n, e);
    }
    if (run.stopped) {
      run.xhrs.delete(n);
      run.pending.unshift(n);
      return;
    }
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      run.xhrs.set(n, xhr);
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => {
        run.progress.set(n, e.loaded);
        this.updateTransferred(key, run);
      };
      xhr.onload = () => {
        run.xhrs.delete(n);
        if (xhr.status >= 200 && xhr.status < 300) {
          run.done.add(n);
          run.progress.delete(n);
          run.retries.delete(n);
          this.patch(key, { partsDone: run.done.size });
          this.updateTransferred(key, run);
          this.pump(key);
        } else {
          run.progress.delete(n);
          if (xhr.status === 403) run.urls.delete(n);
          void this.retryPart(key, run, n, new Error(`HTTP ${xhr.status}`));
        }
        resolve();
      };
      xhr.onerror = () => {
        run.xhrs.delete(n);
        run.progress.delete(n);
        run.urls.delete(n);
        void this.retryPart(key, run, n, new Error('network'));
        resolve();
      };
      xhr.onabort = () => {
        run.xhrs.delete(n);
        run.progress.delete(n);
        if (!run.done.has(n) && !run.pending.includes(n)) run.pending.unshift(n);
        this.updateTransferred(key, run);
        resolve();
      };
      xhr.send(blob);
    });
  }

  /** Неудавшаяся часть повторяется автоматически, с ограничением числа попыток (ТЗ §6.3) */
  private async retryPart(key: string, run: Run, n: number, err: unknown) {
    if (run.stopped) {
      if (!run.pending.includes(n)) run.pending.unshift(n);
      return;
    }
    if (!navigator.onLine) {
      run.pending.unshift(n);
      this.patch(key, { status: 'offline' });
      return;
    }
    if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      return this.fail(key, err);
    }
    const attempt = (run.retries.get(n) ?? 0) + 1;
    run.retries.set(n, attempt);
    if (attempt > MAX_PART_RETRIES) return this.fail(key, err);
    await new Promise((r) => setTimeout(r, BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]));
    if (run.stopped) {
      run.pending.unshift(n);
      return;
    }
    run.pending.unshift(n);
    this.pump(key);
  }

  private updateTransferred(key: string, run: Run) {
    const s = run.session;
    if (!s) return;
    let bytes = 0;
    for (const n of run.done) bytes += n === s.partsCount ? s.size - s.partSize * (s.partsCount - 1) : s.partSize;
    for (const v of run.progress.values()) bytes += v;
    const it = this.item(key);
    if (it && it.transferred !== bytes) this.patch(key, { transferred: Math.min(bytes, s.size) });
  }

  private async complete(key: string, run: Run) {
    if (run.completing) return;
    run.completing = true;
    this.patch(key, { status: 'completing', speed: 0, eta: 0 });
    try {
      const sha256 = await this.ensureHash(key, run);
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await api<{ assetId: string }>(`/uploads/${run.session!.id}/complete`, { method: 'POST', body: { sha256 } });
          this.patch(key, { status: 'done', assetId: r.assetId, transferred: run.file.size });
          this.runs.delete(key);
          const done = this.item(key);
          if (done) this.completedListeners.forEach((l) => l(done));
          this.schedule();
          return;
        } catch (e) {
          // Хранилище не получило часть — досылаем только её
          if (e instanceof ApiError && e.code === 'PARTS_MISSING') {
            const missing = (e.details?.missing as number[]) ?? [];
            missing.forEach((n) => run.done.delete(n));
            run.pending.push(...missing);
            run.completing = false;
            this.patch(key, { status: 'uploading' });
            this.pump(key);
            return;
          }
          if (e instanceof ApiError && (e.code === 'UPLOAD_COMPLETING' || e.status >= 500 || e.status === 0) && attempt < 8) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      run.completing = false;
      this.fail(key, e);
    }
  }

  /** Контрольная сумма файла; если подсчёт сорвался из-за сети — дожидаемся связи и считаем заново */
  private async ensureHash(key: string, run: Run): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run.hash!;
      } catch (e) {
        if (attempt >= 3) throw e;
        if (!navigator.onLine) await new Promise((r) => window.addEventListener('online', r, { once: true }));
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        run.hashFailed = true;
        this.startHash(key, run);
      }
    }
  }

  private fail(key: string, e: unknown) {
    const run = this.runs.get(key);
    if (run) {
      run.stopped = true;
      run.xhrs.forEach((x) => x.abort());
    }
    const err = e instanceof ApiError ? { code: e.code, message: e.message, details: e.details } : { code: 'UNKNOWN', message: (e as Error)?.message ?? String(e) };
    this.patch(key, { status: 'error', error: err, speed: 0, eta: 0 });
    this.schedule();
  }

  // ---------- управление ----------

  pause(key: string) {
    const run = this.runs.get(key);
    if (!run) return;
    run.stopped = true;
    run.xhrs.forEach((x) => x.abort());
    this.patch(key, { status: 'paused', speed: 0, eta: 0 });
    this.schedule();
  }

  async resume(key: string) {
    const run = this.runs.get(key);
    const it = this.item(key);
    if (!run || !it) return;
    if (run.session) {
      // Сверяем принятые части с хранилищем: продолжаем с того, что реально получено
      try {
        const st = await api<{ session: ServerSession }>(`/uploads/${run.session.id}`);
        run.done = new Set((st.session.parts ?? []).filter((p) => p.size === this.partLen(run, p.partNumber)).map((p) => p.partNumber));
        this.patch(key, { partsDone: run.done.size });
        this.updateTransferred(key, run);
      } catch (e) {
        return this.fail(key, e);
      }
    }
    run.completing = false;
    this.patch(key, { status: 'queued', error: undefined });
    this.schedule();
  }

  private partLen(run: Run, n: number) {
    const s = run.session!;
    return n === s.partsCount ? s.size - s.partSize * (s.partsCount - 1) : s.partSize;
  }

  async cancel(key: string) {
    const run = this.runs.get(key);
    const it = this.item(key);
    if (run) {
      run.stopped = true;
      run.xhrs.forEach((x) => x.abort());
      run.hashWorker?.terminate();
    }
    const sessionId = run?.session?.id ?? it?.sessionId;
    this.patch(key, { status: 'canceled', speed: 0, eta: 0 });
    this.runs.delete(key);
    if (sessionId) await api(`/uploads/${sessionId}`, { method: 'DELETE' }).catch(() => undefined);
    this.schedule();
  }

  dismiss(key: string) {
    this.items = this.items.filter((i) => i.key !== key);
    this.runs.delete(key);
    this.emit();
  }

  clearFinished() {
    this.items = this.items.filter((i) => !['done', 'canceled'].includes(i.status));
    this.emit();
  }

  // ---------- возобновление после закрытия браузера ----------

  /** Незавершённые сессии с сервера, которых нет в текущей вкладке */
  adoptServerSessions(sessions: ServerSession[]) {
    let changed = false;
    for (const s of sessions) {
      if (this.items.some((i) => i.sessionId === s.id)) continue;
      this.items.push({
        key: `s${s.id}`,
        sessionId: s.id,
        name: s.fileName,
        size: Number(s.size),
        folderId: s.folderId,
        status: 'needs-file',
        transferred: 0,
        hashed: 0,
        speed: 0,
        eta: 0,
        partsCount: s.partsCount,
        expiresAt: s.expiresAt,
        createdAt: Date.now(),
      });
      changed = true;
    }
    if (changed) this.emit();
  }

  /** Пользователь заново выбрал файл: сверяем имя, размер, дату изменения и хеш первой части (ТЗ §6.3) */
  async attachFile(key: string, file: File) {
    const it = this.item(key);
    if (!it?.sessionId) return;
    this.patch(key, { status: 'preparing', error: undefined });
    try {
      const firstPartSha256 = await sha256Hex(file.slice(0, Math.min(file.size, FIRST_CHUNK)));
      const r = await api<{ session: ServerSession }>(`/uploads/${it.sessionId}/match`, {
        method: 'POST',
        body: { fileName: file.name, size: file.size, lastModified: Math.floor(file.lastModified), firstPartSha256 },
      });
      const run = this.newRun(file);
      run.session = r.session;
      run.parallel = this.parallelParts;
      run.done = new Set((r.session.parts ?? []).map((p) => p.partNumber));
      this.runs.set(key, run);
      this.patch(key, { partsDone: run.done.size, partsCount: r.session.partsCount, status: 'queued' });
      this.updateTransferred(key, run);
      this.schedule();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FILE_MISMATCH') {
        this.patch(key, { status: 'needs-file', error: { code: e.code, message: e.message, details: e.details } });
        return;
      }
      this.fail(key, e);
    }
  }

  // ---------- сеть и скорость ----------

  private onOffline() {
    for (const [key, run] of this.runs) {
      const it = this.item(key);
      if (it?.status === 'uploading') {
        run.xhrs.forEach((x) => x.abort());
        this.patch(key, { status: 'offline', speed: 0, eta: 0 });
      }
    }
  }

  private onOnline() {
    for (const it of this.items) if (it.status === 'offline') void this.resume(it.key);
  }

  /** Скорость и оставшееся время считаются по реально переданным байтам за последние секунды */
  private ensureTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      const now = Date.now();
      let any = false;
      for (const [key, run] of this.runs) {
        const it = this.item(key);
        if (!it || it.status !== 'uploading') continue;
        any = true;
        run.samples.push({ t: now, bytes: it.transferred });
        while (run.samples.length > 2 && now - run.samples[0].t > 6000) run.samples.shift();
        const first = run.samples[0];
        const dt = (now - first.t) / 1000;
        const speed = dt > 0.5 ? Math.max(0, (it.transferred - first.bytes) / dt) : 0;
        const eta = speed > 0 ? (it.size - it.transferred) / speed : 0;
        if (Math.abs(speed - it.speed) > 1 || Math.abs(eta - it.eta) > 1) this.patch(key, { speed, eta });
      }
      if (!any && !this.busy && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    }, 1000);
  }
}

let instance: UploadManager | null = null;
export function getUploadManager(): UploadManager {
  instance ??= new UploadManager();
  return instance;
}
