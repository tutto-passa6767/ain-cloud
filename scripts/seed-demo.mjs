// Демо-ролик для главной страницы (ТЗ §5: «демо 4K-плеера»).
// Создаёт служебный аккаунт demo@ain.kz (данные вымышленные и отделены от пользовательских, ТЗ §19),
// загружает ролик через обычный API, ждёт обработки, создаёт ссылку «только просмотр»
// и записывает её в настройку landing.demoShareToken. Повторный запуск ничего не дублирует.
//
//   node scripts/seed-demo.mjs [путь к видео]   (по умолчанию tests/fixtures/generated/ain-demo-4k.mp4)
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
process.env.E2E_API ??= process.env.AIN_API ?? 'http://localhost:4000/api';

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { Client, uploadFile, waitFor } = await import(new URL('../tests/e2e/lib.mjs', import.meta.url));

const video = process.argv[2] ?? join(root, 'tests', 'fixtures', 'generated', 'ain-demo-4k.mp4');
if (!existsSync(video)) {
  console.error(`Нет файла ${video}. Сгенерируйте его: sh tests/fixtures/make-fixtures.sh`);
  process.exit(1);
}

const prisma = new PrismaClient();
const EMAIL = 'demo@ain.kz';
try {
  const current = await prisma.setting.findUnique({ where: { key: 'landing.demoShareToken' } });
  if (typeof current?.value === 'string' && current.value && !process.argv.includes('--force')) {
    const share = await prisma.shareLink.findUnique({ where: { token: current.value } });
    if (share && !share.revokedAt && !share.blockedAt) {
      console.log('Демо уже настроено (используйте --force, чтобы заменить)');
      process.exit(0);
    }
  }

  // Пароль демо-аккаунта случайный и нигде не хранится: аккаунт служебный, входить в него не нужно
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, planCode: 'PRO', blockedAt: null },
    create: {
      email: EMAIL,
      name: 'AIN Cloud Demo',
      passwordHash,
      planCode: 'PRO',
      emailVerifiedAt: new Date(),
      onboardedAt: new Date(),
      mascotMode: 'OFF',
      pdConsentAt: new Date(),
    },
  });

  const c = new Client();
  const login = await c.post('/auth/login', { email: EMAIL, password });
  if (login.status !== 200) throw new Error(`Вход демо-аккаунта: ${login.status} ${JSON.stringify(login.data)}`);

  console.log('Загружаю ролик…');
  const { assetId } = await uploadFile(c, video, { name: 'AIN Cloud — демо 4K.mp4' });
  const asset = await waitFor(async () => {
    const a = (await c.get(`/assets/${assetId}`)).data.asset;
    return { done: ['READY', 'FAILED', 'UNSUPPORTED'].includes(a.processing) && a.state !== 'RECEIVED' && a.state !== 'SCANNING', value: a };
  }, { timeoutMs: 20 * 60_000, intervalMs: 3000, label: 'обработка демо-ролика' });
  if (asset.processing !== 'READY') throw new Error(`Обработка не удалась: ${asset.processing} ${asset.processingError ?? ''}`);

  const share = await c.post('/shares', { assetId, viewOnly: true });
  if (share.status !== 201) throw new Error(`Ссылка: ${share.status} ${JSON.stringify(share.data)}`);
  const token = share.data.url.split('/s/')[1];
  await prisma.setting.upsert({
    where: { key: 'landing.demoShareToken' },
    update: { value: token },
    create: { key: 'landing.demoShareToken', value: token },
  });
  console.log(`Готово: демо на главной — ${share.data.url}`);
} finally {
  await prisma.$disconnect();
}
