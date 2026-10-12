// Помощники сквозных тестов: HTTP-клиент с cookie и CSRF, почта из Mailpit, загрузка частями.
import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

export const API = process.env.E2E_API ?? 'http://localhost:4000/api';
export const MAILPIT = process.env.E2E_MAILPIT ?? 'http://localhost:58025';

export class Client {
  constructor() {
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  remember(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/Expires=Thu, 01 Jan 1970/i.test(c) || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async req(method, path, body, { raw = false } = {}) {
    if (method !== 'GET' && !this.cookies.has('ain_csrf')) await this.req('GET', '/auth/csrf');
    const headers = { cookie: this.cookieHeader() };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['x-csrf-token'] = this.cookies.get('ain_csrf');
    const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    this.remember(res);
    if (raw) return res;
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  get(path) {
    return this.req('GET', path);
  }
  post(path, body = {}) {
    return this.req('POST', path, body);
  }
  patch(path, body = {}) {
    return this.req('PATCH', path, body);
  }
  del(path) {
    return this.req('DELETE', path);
  }
}

export async function mailCode(email, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages = [] } = await r.json();
    if (messages.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const code = /(\d{6})/.exec(m.Text ?? '')?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Письмо с кодом для ${email} не пришло`);
}

export async function registerUser(prefix = 'e2e') {
  const c = new Client();
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ain.test`;
  const password = 'correct-horse-battery';
  // Регистрация ограничена по частоте (защита от перебора) — при 429 тест ждёт и повторяет
  let s;
  for (let attempt = 0; attempt < 8; attempt++) {
    s = await c.post('/auth/signup', { email, password, name: 'Тест Тестов', locale: 'ru', pdConsent: true });
    if (s.status !== 429) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (s.status !== 201) throw new Error(`signup ${s.status} ${JSON.stringify(s.data)}`);
  const code = await mailCode(email);
  let v;
  for (let attempt = 0; attempt < 8; attempt++) {
    v = await c.post('/auth/verify-email', { code });
    if (v.status !== 429) break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.data)}`);
  return { c, email, password };
}

export async function sha256File(path) {
  const h = createHash('sha256');
  const fh = await open(path, 'r');
  try {
    for await (const chunk of fh.createReadStream()) h.update(chunk);
  } finally {
    await fh.close();
  }
  return h.digest('hex');
}

async function readPart(path, start, length) {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    return buf;
  } finally {
    await fh.close();
  }
}

/** Загрузка так же, как это делает браузер: подписанные ссылки на части → PUT напрямую в хранилище */
export async function startUpload(c, path, { folderId = null, name } = {}) {
  const { size, mtimeMs } = await stat(path);
  const fileName = name ?? path.split(/[\\/]/).pop();
  const firstLen = Math.min(size, 64 * 1024 * 1024);
  const firstPartSha256 = createHash('sha256').update(await readPart(path, 0, firstLen)).digest('hex');
  const r = await c.post('/uploads', { fileName, size, lastModified: Math.floor(mtimeMs), firstPartSha256, folderId, mimeType: 'video/mp4' });
  return { ...r, size, fileName };
}

export async function putParts(c, path, session, partNumbers) {
  const { data } = await c.post(`/uploads/${session.id}/parts`, { partNumbers });
  for (const n of partNumbers) {
    const start = (n - 1) * session.partSize;
    const len = Math.min(session.partSize, session.size - start);
    const body = await readPart(path, start, len);
    const res = await fetch(data.urls[n], { method: 'PUT', body });
    if (!res.ok) throw new Error(`PUT части ${n}: ${res.status} ${await res.text()}`);
    if (!res.headers.get('etag')) throw new Error(`Хранилище не вернуло ETag для части ${n}`);
  }
}

export async function uploadFile(c, path, opts = {}) {
  const start = await startUpload(c, path, opts);
  if (start.status !== 201) throw new Error(`start ${start.status} ${JSON.stringify(start.data)}`);
  const session = start.data.session;
  const all = Array.from({ length: session.partsCount }, (_, i) => i + 1);
  await putParts(c, path, session, all);
  const sha256 = await sha256File(path);
  const done = await c.post(`/uploads/${session.id}/complete`, { sha256 });
  if (done.status !== 200) throw new Error(`complete ${done.status} ${JSON.stringify(done.data)}`);
  return { assetId: done.data.assetId, sessionId: session.id, sha256 };
}

export async function waitFor(fn, { timeoutMs = 300_000, intervalMs = 1000, label = 'условие' } = {}) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last?.done) return last.value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Не дождались: ${label}. Последнее значение: ${JSON.stringify(last?.value ?? last)}`);
}

/** Загрузка файла из памяти (для образцов, которые нельзя держать на диске, — например, EICAR) */
export async function uploadBuffer(c, buf, fileName) {
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const r = await c.post('/uploads', {
    fileName, size: buf.length, lastModified: 1, firstPartSha256: sha(buf.subarray(0, 64 * 1024 * 1024)),
  });
  if (r.status !== 201) throw new Error(`start ${r.status} ${JSON.stringify(r.data)}`);
  const session = r.data.session;
  const { data } = await c.post(`/uploads/${session.id}/parts`, { partNumbers: [1] });
  const put = await fetch(data.urls[1], { method: 'PUT', body: buf });
  if (!put.ok) throw new Error(`PUT ${put.status}`);
  const done = await c.post(`/uploads/${session.id}/complete`, { sha256: sha(buf) });
  if (done.status !== 200) throw new Error(`complete ${done.status} ${JSON.stringify(done.data)}`);
  return { assetId: done.data.assetId };
}

/** Минимальный ZIP без сжатия с одним файлом */
export function zipOne(name, content) {
  const n = Buffer.from(name);
  const crc = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x21, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(n.length, 28);
  const cdOffset = local.length + n.length + content.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, n, content, central, n, end]);
}

/** Стандартный тестовый образец EICAR; собирается в памяти, чтобы антивирус машины не удалял файлы репозитория */
export function eicar() {
  return Buffer.from(['X5O!P%@AP[4', String.fromCharCode(92), 'PZX54(P^)7CC)7}$EICAR', '-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
}
