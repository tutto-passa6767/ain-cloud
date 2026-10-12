// Сквозные сценарии ТЗ §18–19 против запущенного стека (API + воркер + хранилище).
// Запуск: npm run test:e2e   (перед этим: sh tests/fixtures/make-fixtures.sh)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client, eicar, putParts, registerUser, sha256File, startUpload, uploadBuffer, uploadFile, waitFor, zipOne } from './lib.mjs';

const FIX = join(import.meta.dirname, '..', 'fixtures', 'generated');
const VIDEO = join(FIX, 'uhd-4k.mp4');
const PHOTO = join(FIX, 'photo.jpg');
const FAKE = join(FIX, 'fake-video.mp4');

if (!existsSync(VIDEO)) throw new Error('Нет тестовых файлов: выполните sh tests/fixtures/make-fixtures.sh');

const assetOf = async (c, id) => (await c.get(`/assets/${id}`)).data?.asset;

test('Основной сценарий: регистрация → папка → загрузка → проверка → каталог → идентичный оригинал', { timeout: 15 * 60_000 }, async (t) => {
  const { c } = await registerUser('main');

  const folder = await c.post('/folders', { name: 'Съёмка 2026 · 4K' });
  assert.equal(folder.status, 201);
  const folderId = folder.data.folder.id;

  // Резерв квоты виден сразу после старта загрузки
  const { assetId, sha256 } = await uploadFile(c, VIDEO, { folderId });
  const me = await c.get('/me');
  assert.equal(me.data.usage.reservedBytes, 0, 'после завершения резерв снят');
  assert.ok(me.data.usage.usedBytes >= 129_000_000, 'занятое место учитывает файл');

  await t.test('Повторное завершение идемпотентно — дубликата нет', async () => {
    const list = await c.get('/uploads');
    const session = list.data.recent.find((s) => s.assetId === assetId);
    const again = await c.post(`/uploads/${session.id}/complete`, { sha256 });
    assert.equal(again.status, 200);
    assert.equal(again.data.assetId, assetId);
    const drive = await c.get(`/drive?folderId=${folderId}`);
    assert.equal(drive.data.assets.length, 1);
  });

  const verified = await waitFor(async () => {
    const a = await assetOf(c, assetId);
    return { done: ['VERIFIED', 'RESTRICTED', 'BLOCKED', 'CORRUPTED'].includes(a.state), value: a };
  }, { label: 'проверка файла', timeoutMs: 180_000 });
  assert.equal(verified.state, 'VERIFIED', `состояние ${verified.state}: ${verified.stateReason}`);
  assert.equal(verified.sha256, sha256, 'сервер пересчитал ту же контрольную сумму');
  assert.equal(verified.detectedMime, 'video/mp4');

  await t.test('Файл появился в каталоге папки', async () => {
    const drive = await c.get(`/drive?folderId=${folderId}`);
    assert.equal(drive.data.assets[0].id, assetId);
    assert.deepEqual(drive.data.path.map((p) => p.name), ['Съёмка 2026 · 4K']);
  });

  await t.test('Проверенный оригинал скачивается до окончания обработки и совпадает побайтово', async () => {
    const dl = await c.post(`/assets/${assetId}/download`, {});
    assert.equal(dl.status, 200, JSON.stringify(dl.data));
    const res = await fetch(dl.data.url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /attachment/);
    const h = createHash('sha256');
    for await (const chunk of res.body) h.update(chunk);
    assert.equal(h.digest('hex'), await sha256File(VIDEO));
  });

  const ready = await waitFor(async () => {
    const a = await assetOf(c, assetId);
    return { done: ['READY', 'FAILED', 'UNSUPPORTED'].includes(a.processing), value: a };
  }, { label: 'обработка видео', timeoutMs: 12 * 60_000, intervalMs: 3000 });
  assert.equal(ready.processing, 'READY', ready.processingError ?? '');

  await t.test('Метаданные — по реальным данным', async () => {
    assert.equal(ready.width, 3840);
    assert.equal(ready.height, 2160);
    assert.ok(Math.abs(ready.durationSec - 12) < 0.5);
    assert.equal(ready.meta.video.codec, 'h264');
    assert.ok(ready.thumbSm && ready.thumbLg, 'миниатюры есть');
    assert.ok(ready.sprite?.url, 'спрайт для перемотки есть');
  });

  await t.test('HLS: на Free — не выше 1080p, сегменты отдаются по подписанным ссылкам', async () => {
    const master = await c.req('GET', `/assets/${assetId}/hls/master.m3u8`, undefined, { raw: true });
    assert.equal(master.status, 200);
    const text = await master.text();
    assert.match(text, /#EXTM3U/);
    const heights = [...text.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
    assert.ok(heights.length >= 2, 'несколько качеств');
    assert.ok(Math.max(...heights) <= 1080, `Free видит максимум 1080p, а не ${Math.max(...heights)}`);
    // Несуществующий или подделанный вариант не отдаётся
    assert.equal((await c.req('GET', `/assets/${assetId}/hls/v9.m3u8`, undefined, { raw: true })).status, 404);
    assert.equal((await c.req('GET', `/assets/${assetId}/hls/..%2F..%2Fmaster.m3u8`, undefined, { raw: true })).status, 404);
    const variant = text.split('\n').find((l) => l.endsWith('.m3u8'));
    const vres = await c.req('GET', `/assets/${assetId}/hls/${variant}`, undefined, { raw: true });
    const vtext = await vres.text();
    const segment = vtext.split('\n').find((l) => l.startsWith('http'));
    const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(vtext)?.[1];
    assert.ok(init?.startsWith('http'), 'init-сегмент подписан');
    assert.equal((await fetch(init)).status, 200);
    assert.equal((await fetch(segment)).status, 200);
  });

  await t.test('Чужой пользователь не видит файл ни через API, ни через превью, сегменты и поиск', async () => {
    const { c: other } = await registerUser('intruder');
    assert.equal((await other.get(`/assets/${assetId}`)).status, 404);
    assert.equal((await other.post(`/assets/${assetId}/download`, {})).status, 404);
    assert.equal((await other.req('GET', `/assets/${assetId}/hls/master.m3u8`, undefined, { raw: true })).status, 404);
    assert.equal((await other.get(`/drive?folderId=${folderId}`)).status, 404);
    assert.equal((await other.patch(`/assets/${assetId}`, { name: 'взлом' })).status, 404);
    assert.equal((await other.del(`/assets/${assetId}`)).status, 404);
    const s = await other.get('/search?q=uhd');
    assert.equal(s.data.assets.length, 0);
    const sug = await other.get('/search/suggest?q=uhd');
    assert.equal(sug.data.items.length, 0);
    // Без входа — 401
    const anon = new Client();
    assert.equal((await anon.get(`/assets/${assetId}`)).status, 401);
  });

  await t.test('Поиск находит свой файл по названию и тегу', async () => {
    await c.patch(`/assets/${assetId}`, { tags: ['Клиент', 'монтаж'] });
    const byName = await c.get('/search?q=uhd');
    assert.equal(byName.data.assets[0].id, assetId);
    const byTag = await c.get('/search?q=монтаж');
    assert.equal(byTag.data.assets[0].id, assetId);
    const filtered = await c.get('/search?kind=PHOTO');
    assert.equal(filtered.data.assets.length, 0);
  });

  await t.test('Переименование меняет только отображаемое имя', async () => {
    const r = await c.patch(`/assets/${assetId}`, { name: 'Финальный монтаж.mp4' });
    assert.equal(r.data.asset.name, 'Финальный монтаж.mp4');
    assert.equal(r.data.asset.originalName, 'uhd-4k.mp4');
    const dl = await c.post(`/assets/${assetId}/download`, {});
    assert.equal(dl.data.fileName, 'uhd-4k.mp4', 'скачивается оригинал с исходным именем');
  });

  await t.test('Удаление и восстановление папки возвращает файл и связи', async () => {
    assert.equal((await c.del(`/folders/${folderId}`)).status, 200);
    assert.equal((await c.get(`/assets/${assetId}`)).status, 404, 'файл в корзине не открывается');
    const trash = await c.get('/trash');
    assert.equal(trash.data.folders[0].id, folderId);
    assert.equal(trash.data.folders[0].files, 1);
    await c.post('/trash/restore', { folderIds: [folderId], assetIds: [] });
    const a = await assetOf(c, assetId);
    assert.equal(a.folderId, folderId);
  });
});

test('Безопасность загрузки: подмена типа и вирус блокируются', { timeout: 5 * 60_000 }, async () => {
  const { c } = await registerUser('sec');
  const fake = await uploadFile(c, FAKE);
  const virus = await uploadBuffer(c, zipOne('eicar.com', eicar()), 'eicar.zip');
  const final = (id) =>
    waitFor(async () => {
      const a = await assetOf(c, id);
      return { done: !['RECEIVED', 'SCANNING'].includes(a.state), value: a };
    }, { label: 'проверка', timeoutMs: 120_000 });

  const f = await final(fake.assetId);
  assert.equal(f.state, 'BLOCKED');
  assert.match(f.stateReason, /TYPE_MISMATCH/);
  assert.equal((await c.post(`/assets/${fake.assetId}/download`, {})).status, 403, 'заблокированный файл не выдаётся');

  const e = await final(virus.assetId);
  // Если ClamAV ещё загружает базы, файл остаётся «Ограничен», но никогда не «Проверен»
  assert.ok(['BLOCKED', 'RESTRICTED'].includes(e.state), `EICAR получил ${e.state}`);
  assert.notEqual(e.state, 'VERIFIED');
  if (e.state === 'BLOCKED') assert.match(e.stateReason, /MALWARE.*Eicar/i);
});

test('Квота: параллельные загрузки не обходят лимит, отмена снимает резерв', { timeout: 3 * 60_000 }, async () => {
  const { c } = await registerUser('quota');
  const GiB = 1024 ** 3;
  const start = (i) =>
    c.post('/uploads', { fileName: `big-${i}.mov`, size: 4 * GiB, lastModified: 1, firstPartSha256: 'a'.repeat(64) });
  // Free: 10 ГБ. Три одновременных старта по 4 ГБ — пройти должны ровно два
  const results = await Promise.all([start(1), start(2), start(3)]);
  const ok = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  assert.equal(ok.length, 2);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].data.code, 'QUOTA_EXCEEDED');
  assert.equal((await c.get('/me')).data.usage.reservedBytes, 8 * GiB);

  // Больше лимита файла для тарифа
  const tooBig = await c.post('/uploads', { fileName: 'huge.mov', size: 6 * GiB, lastModified: 1, firstPartSha256: 'a'.repeat(64) });
  assert.equal(tooBig.data.code, 'FILE_TOO_LARGE');
  // Неразрешённый формат
  const exe = await c.post('/uploads', { fileName: 'setup.exe', size: 10, lastModified: 1, firstPartSha256: 'a'.repeat(64) });
  assert.equal(exe.data.code, 'FORMAT_NOT_ALLOWED');

  for (const r of ok) assert.equal((await c.del(`/uploads/${r.data.session.id}`)).status, 200);
  assert.equal((await c.get('/me')).data.usage.reservedBytes, 0);
});

test('Возобновление: принятые части сверяются с хранилищем, сверка файла при повторном выборе', { timeout: 5 * 60_000 }, async () => {
  const { c } = await registerUser('resume');
  const start = await startUpload(c, VIDEO);
  const session = start.data.session;
  assert.ok(session.partsCount >= 2, 'файл делится на части');
  await putParts(c, VIDEO, session, [1]);

  // «Обновление страницы»: состояние берётся с сервера
  const st = await c.get(`/uploads/${session.id}`);
  assert.deepEqual(st.data.session.parts.map((p) => p.partNumber), [1]);

  // Завершить без всех частей нельзя
  const early = await c.post(`/uploads/${session.id}/complete`, { sha256: 'b'.repeat(64) });
  assert.equal(early.data.code, 'PARTS_MISSING');

  // Пользователь выбрал другой файл
  const wrong = await c.post(`/uploads/${session.id}/match`, {
    fileName: 'photo.jpg', size: 1, lastModified: 1, firstPartSha256: 'c'.repeat(64),
  });
  assert.equal(wrong.data.code, 'FILE_MISMATCH');
  // Тот же файл — сессия находится, досылаются только недостающие части
  const right = await c.post(`/uploads/${session.id}/match`, {
    fileName: session.fileName, size: session.size, lastModified: session.lastModified, firstPartSha256: session.firstPartSha256,
  });
  assert.equal(right.status, 200);
  const missing = Array.from({ length: session.partsCount }, (_, i) => i + 1).filter((n) => !right.data.session.parts.some((p) => p.partNumber === n));
  await putParts(c, VIDEO, session, missing);
  const done = await c.post(`/uploads/${session.id}/complete`, { sha256: await sha256File(VIDEO) });
  assert.equal(done.status, 200);
});

test('Фото: превью, EXIF, GPS только владельцу, дата съёмки отдельно', { timeout: 5 * 60_000 }, async () => {
  const { c } = await registerUser('photo');
  const { assetId } = await uploadFile(c, PHOTO);
  const a = await waitFor(async () => {
    const x = await assetOf(c, assetId);
    return { done: ['READY', 'FAILED', 'UNSUPPORTED'].includes(x.processing), value: x };
  }, { label: 'обработка фото', timeoutMs: 180_000 });
  assert.equal(a.processing, 'READY', a.processingError ?? '');
  assert.equal(a.width, 6000);
  assert.equal(a.height, 4000);
  assert.ok(a.preview && a.thumbSm && a.thumbLg);
  assert.equal(a.exif.Model, 'TestCam');
  assert.equal(new Date(a.takenAt).toISOString(), '2026-09-01T10:20:30.000Z');
  assert.ok(a.sensitiveMeta?.GPSLatitude, 'владелец видит координаты');
  assert.equal(a.exif.GPSLatitude, undefined, 'координат нет в общем EXIF');
  const thumb = await fetch(a.thumbLg);
  assert.equal(thumb.headers.get('content-type'), 'image/webp');
});
