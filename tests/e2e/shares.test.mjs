// Публичные ссылки (ТЗ §9, §18): пароль и срок, лимит, «только просмотр», отзыв, границы папки, жалобы.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client, registerUser, uploadFile, waitFor } from './lib.mjs';

const FIX = join(import.meta.dirname, '..', 'fixtures', 'generated');
const VIDEO = join(FIX, 'uhd-4k.mp4');
const PHOTO = join(FIX, 'photo.jpg');
const ROOT = join(import.meta.dirname, '..', '..');

/** Служебное изменение данных для теста (смена тарифа, «перемотка» срока) — напрямую в БД стенда */
function sql(query) {
  execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'ain', '-d', 'ain', '-v', 'ON_ERROR_STOP=1', '-c', query], { cwd: ROOT, stdio: 'pipe' });
}

const ready = (c, id) =>
  waitFor(async () => {
    const a = (await c.get(`/assets/${id}`)).data.asset;
    return { done: a.state === 'VERIFIED' && ['READY', 'UNSUPPORTED', 'FAILED'].includes(a.processing), value: a };
  }, { label: 'обработка', timeoutMs: 600_000, intervalMs: 2000 });

const tokenOf = (url) => url.split('/s/')[1];

test('Ссылки: Free — простая ссылка; гость смотрит и скачивает идентичный оригинал', { timeout: 15 * 60_000 }, async () => {
  const { c } = await registerUser('share-free');
  const { assetId } = await uploadFile(c, PHOTO);
  await ready(c, assetId);

  // Пароль, срок, лимит — только на Pro
  const denied = await c.post('/shares', { assetId, password: 'secret12' });
  assert.equal(denied.data.code, 'PLAN_FEATURE_REQUIRED');

  const s = await c.post('/shares', { assetId });
  assert.equal(s.status, 201);
  const token = tokenOf(s.data.url);

  const guest = new Client();
  const meta = await guest.get(`/public/s/${token}`);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.requiresPassword, false);
  assert.equal(meta.data.name, 'photo.jpg');

  const content = await guest.get(`/public/s/${token}/content`);
  assert.equal(content.data.asset.id, assetId);
  assert.equal(content.data.asset.sensitiveMeta, null, 'гость не видит GPS');
  assert.ok(content.data.asset.preview);

  const dl = await guest.post(`/public/s/${token}/assets/${assetId}/download`);
  assert.equal(dl.status, 200);
  const res = await fetch(dl.data.url);
  const h = createHash('sha256');
  for await (const chunk of res.body) h.update(chunk);
  const own = (await c.get(`/assets/${assetId}`)).data.asset;
  assert.equal(h.digest('hex'), own.sha256);

  // Статистика владельца: открытия и выданные ссылки
  const list = await c.get(`/shares?assetId=${assetId}`);
  assert.ok(list.data.items[0].opens >= 1);
  assert.equal(list.data.items[0].downloadsIssued, 1);

  // Отзыв: новые запросы закрыты
  await c.del(`/shares/${s.data.id}`);
  assert.equal((await guest.get(`/public/s/${token}`)).data.code, 'SHARE_REVOKED');
  assert.equal((await guest.post(`/public/s/${token}/assets/${assetId}/download`)).status, 410);
});

test('Ссылки Pro: пароль, срок, лимит скачиваний, «только просмотр», границы папки, жалоба', { timeout: 15 * 60_000 }, async () => {
  const { c, email } = await registerUser('share-pro');
  sql(`UPDATE "User" SET "planCode" = 'PRO' WHERE email = '${email}'`);

  const folder = (await c.post('/folders', { name: 'Для клиента' })).data.folder;
  const sub = (await c.post('/folders', { name: 'Исходники', parentId: folder.id })).data.folder;
  const outside = (await c.post('/folders', { name: 'Личное' })).data.folder;
  const inSub = await uploadFile(c, PHOTO, { folderId: sub.id });
  const secret = await uploadFile(c, PHOTO, { folderId: outside.id, name: 'secret.jpg' });
  await ready(c, inSub.assetId);
  await ready(c, secret.assetId);

  // Пароль + лимит 1 скачивание
  const s = (await c.post('/shares', { folderId: folder.id, password: 'client-2026', maxDownloads: 1 })).data;
  const token = tokenOf(s.url);
  const guest = new Client();
  const meta = await guest.get(`/public/s/${token}`);
  assert.equal(meta.data.requiresPassword, true);
  assert.equal(meta.data.name, null, 'без пароля не раскрывается даже название');
  assert.equal((await guest.get(`/public/s/${token}/content`)).data.code, 'SHARE_PASSWORD_REQUIRED');
  assert.equal((await guest.post(`/public/s/${token}/unlock`, { password: 'wrong-pass' })).data.code, 'SHARE_WRONG_PASSWORD');
  assert.equal((await guest.post(`/public/s/${token}/unlock`, { password: 'client-2026' })).status, 200);

  // Внутри ветки — доступно, в том числе во вложенной папке
  const root = await guest.get(`/public/s/${token}/content`);
  assert.deepEqual(root.data.folders.map((f) => f.name), ['Исходники']);
  const subList = await guest.get(`/public/s/${token}/content?folderId=${sub.id}`);
  assert.equal(subList.data.assets[0].id, inSub.assetId);
  // За пределами ветки — нет, ни папка, ни файл
  assert.equal((await guest.get(`/public/s/${token}/content?folderId=${outside.id}`)).status, 404);
  assert.equal((await guest.get(`/public/s/${token}/assets/${secret.assetId}`)).status, 404);
  assert.equal((await guest.post(`/public/s/${token}/assets/${secret.assetId}/download`)).status, 404);

  // Лимит: параллельные запросы не обходят его
  const both = await Promise.all([1, 2, 3].map(() => guest.post(`/public/s/${token}/assets/${inSub.assetId}/download`)));
  assert.equal(both.filter((r) => r.status === 200).length, 1);
  assert.ok(both.some((r) => r.data?.code === 'SHARE_LIMIT_REACHED'));

  // Чужой гость без cookie разблокировки не проходит
  assert.equal((await new Client().get(`/public/s/${token}/content`)).status, 401);

  // «Только просмотр»: превью есть, оригинал не выдаётся
  const view = (await c.post('/shares', { assetId: inSub.assetId, viewOnly: true })).data;
  const vt = tokenOf(view.url);
  const g2 = new Client();
  assert.ok((await g2.get(`/public/s/${vt}/content`)).data.asset.preview);
  assert.equal((await g2.post(`/public/s/${vt}/assets/${inSub.assetId}/download`)).data.code, 'SHARE_VIEW_ONLY');

  // Срок действия: после истечения доступ закрыт
  const timed = (await c.post('/shares', { assetId: inSub.assetId, expiresAt: new Date(Date.now() + 86400_000).toISOString() })).data;
  sql(`UPDATE "ShareLink" SET "expiresAt" = now() - interval '1 minute' WHERE id = '${timed.id}'`);
  assert.equal((await new Client().get(`/public/s/${tokenOf(timed.url)}`)).data.code, 'SHARE_EXPIRED');

  // Жалоба попадает в очередь модерации
  const rep = await new Client().post(`/public/s/${vt}/report`, { reason: 'copyright', text: 'Это моё видео' });
  assert.equal(rep.status, 200);

  // Чужой пользователь не может создать ссылку на чужой файл
  const { c: other } = await registerUser('share-intruder');
  assert.equal((await other.post('/shares', { assetId: inSub.assetId })).status, 404);
});

test('Ссылка на 4K-видео: гость смотрит HLS в пределах тарифа владельца', { timeout: 15 * 60_000 }, async () => {
  const { c } = await registerUser('share-video');
  const { assetId } = await uploadFile(c, VIDEO);
  await ready(c, assetId);
  const s = (await c.post('/shares', { assetId })).data;
  const token = tokenOf(s.url);
  const guest = new Client();
  const master = await guest.req('GET', `/public/s/${token}/assets/${assetId}/hls/master.m3u8`, undefined, { raw: true });
  assert.equal(master.status, 200);
  const text = await master.text();
  const heights = [...text.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...heights) <= 1080, 'владелец на Free — гость тоже видит до 1080p');
  const v = text.split('\n').find((l) => l.endsWith('.m3u8'));
  const vtext = await (await guest.req('GET', `/public/s/${token}/assets/${assetId}/hls/${v}`, undefined, { raw: true })).text();
  assert.equal((await fetch(vtext.split('\n').find((l) => l.startsWith('http')))).status, 200);
});
