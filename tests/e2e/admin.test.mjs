// Админ-панель и 2FA (ТЗ §4.1, §10.3, §15): 2FA обязательна сотрудникам, роли, модерация по жалобе, журнал, настройки.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client, registerUser, uploadFile, waitFor } from './lib.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const PHOTO = join(import.meta.dirname, '..', 'fixtures', 'generated', 'photo.jpg');

function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
/** Код TOTP, как его считает приложение-аутентификатор */
function totp(secret, at = Date.now()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function staff(email, role) {
  // email формируется тестом и содержит только безопасные символы
  execSync(`npm run staff -w @ain/db -- ${email} ${role}`, { cwd: ROOT, stdio: 'pipe' });
}

test('2FA и админ-панель', { timeout: 10 * 60_000 }, async (t) => {
  const admin = await registerUser('admin');
  const user = await registerUser('customer');
  staff(admin.email, 'ADMIN');
  let secret;

  await t.test('Без 2FA сотрудник в админ-панель не попадает', async () => {
    const r = await admin.c.get('/admin/dashboard');
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'MFA_REQUIRED');
  });

  await t.test('Включение 2FA кодом из приложения', async () => {
    const setup = await admin.c.post('/auth/2fa/setup');
    assert.equal(setup.status, 200);
    secret = setup.data.secret;
    assert.match(setup.data.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.match(setup.data.qrSvg, /<svg/);
    assert.equal((await admin.c.post('/auth/2fa/enable', { code: '000000' })).data.code, 'INVALID_CODE');
    assert.equal((await admin.c.post('/auth/2fa/enable', { code: totp(secret) })).status, 200);
    const d = await admin.c.get('/admin/dashboard');
    assert.equal(d.status, 200);
    assert.ok(d.data.users.total >= 2);
    assert.equal(d.data.revenue, null, 'выручка не выдумывается, пока нет платежей');
    // Сотруднику отключить 2FA нельзя
    assert.equal((await admin.c.post('/auth/2fa/disable', { code: totp(secret) })).data.code, 'MFA_MANDATORY');
  });

  await t.test('Вход с 2FA: без кода сессия не выдаётся', async () => {
    const c = new Client();
    const step1 = await c.post('/auth/login', { email: admin.email, password: admin.password });
    assert.equal(step1.data.mfaRequired, true);
    assert.equal((await c.get('/admin/dashboard')).status, 401);
    assert.equal((await c.post('/auth/login/mfa', { mfaToken: step1.data.mfaToken, code: '123456' })).data.code, 'INVALID_CODE');
    const step2 = await c.post('/auth/login/mfa', { mfaToken: step1.data.mfaToken, code: totp(secret) });
    assert.equal(step2.status, 200);
    assert.equal((await c.get('/admin/dashboard')).status, 200);
  });

  await t.test('Обычный пользователь не видит админ-API', async () => {
    for (const p of ['/admin/dashboard', '/admin/users', '/admin/audit', '/admin/reports']) {
      assert.equal((await user.c.get(p)).data.code, 'FORBIDDEN', p);
    }
  });

  let userId;
  await t.test('Смена тарифа и квоты пользователю', async () => {
    const list = await admin.c.get(`/admin/users?q=${encodeURIComponent(user.email)}`);
    assert.equal(list.data.items.length, 1);
    userId = list.data.items[0].id;
    await admin.c.patch(`/admin/users/${userId}`, { planCode: 'PRO', quotaOverrideGb: 2048 });
    const me = await user.c.get('/me');
    assert.equal(me.data.plan.code, 'PRO');
    assert.equal(me.data.usage.quotaBytes, 2048 * 1024 ** 3);
  });

  await t.test('Жалоба → просмотр по жалобе с записью в журнал → блокировка файла и ссылки', async () => {
    const { assetId } = await uploadFile(user.c, PHOTO);
    await waitFor(async () => {
      const a = (await user.c.get(`/assets/${assetId}`)).data.asset;
      return { done: a.processing === 'READY', value: a.processing };
    }, { timeoutMs: 180_000, label: 'фото' });
    const share = (await user.c.post('/shares', { assetId })).data;
    const token = share.url.split('/s/')[1];
    await new Client().post(`/public/s/${token}/report`, { reason: 'illegal', text: 'Проверьте' });

    const reports = await admin.c.get('/admin/reports?status=OPEN');
    const report = reports.data.items.find((r) => r.assetId === assetId);
    assert.ok(report, 'жалоба в очереди');
    const preview = await admin.c.get(`/admin/reports/${report.id}/preview`);
    assert.ok(preview.data.url);

    await admin.c.post(`/admin/reports/${report.id}/resolve`, { action: 'block_asset', reason: 'Нарушение правил' });
    const a = (await user.c.get(`/assets/${assetId}`)).data.asset;
    assert.equal(a.state, 'BLOCKED');
    assert.equal((await user.c.post(`/assets/${assetId}/download`, {})).status, 403);
    assert.equal((await new Client().get(`/public/s/${token}`)).data.code, 'SHARE_BLOCKED');

    // Доступ сотрудника к содержимому записан в журнал
    const audit = await admin.c.get(`/admin/audit?action=staff.content_access&target=${assetId}`);
    assert.equal(audit.data.items.length, 1);
    assert.equal(audit.data.items[0].actorEmail, admin.email);
    const csv = await admin.c.req('GET', '/admin/audit.csv?action=moderation.', undefined, { raw: true });
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /moderation\.block_asset/);
  });

  await t.test('Блокировка пользователя завершает его сессии', async () => {
    await admin.c.patch(`/admin/users/${userId}`, { blocked: true, blockedReason: 'Тест' });
    assert.equal((await user.c.get('/drive')).status, 401);
    const relog = await new Client().post('/auth/login', { email: user.email, password: user.password });
    assert.equal(relog.data.code, 'ACCOUNT_BLOCKED');
    await admin.c.patch(`/admin/users/${userId}`, { blocked: false });
  });

  await t.test('Настройки меняются без разработчиков и проверяются', async () => {
    assert.equal((await admin.c.req('PUT', '/admin/settings/trash.retentionDays', { value: 45 })).status, 200);
    const fresh = await registerUser('settings');
    await waitFor(async () => {
      const r = await fresh.c.get('/trash');
      return { done: r.data.retentionDays === 45, value: r.data.retentionDays };
    }, { timeoutMs: 40_000, label: 'кэш настроек' });
    assert.equal((await admin.c.req('PUT', '/admin/settings/trash.retentionDays', { value: -1 })).data.code, 'INVALID_SETTING');
    assert.equal((await admin.c.req('PUT', '/admin/settings/unknown.key', { value: 1 })).status, 404);
    await admin.c.req('PUT', '/admin/settings/trash.retentionDays', { value: 30 });
  });
});
