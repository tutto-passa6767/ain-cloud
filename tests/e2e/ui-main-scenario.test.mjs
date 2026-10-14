// UI-сценарий ТЗ §19 в настоящем браузере: регистрация → подтверждение → папка → загрузка 4K-файла →
// проверка → появление в каталоге → воспроизведение → скачивание идентичного оригинала.
// Требует запущенные веб (localhost:3000), API и воркер. Скриншоты — в tests/e2e/.artifacts.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mailCode, sha256File } from './lib.mjs';

const require = createRequire(join(import.meta.dirname, '..', '..', 'apps', 'web', 'package.json'));
const { chromium } = require('playwright');

const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const FIX = join(import.meta.dirname, '..', 'fixtures', 'generated');
const VIDEO = join(FIX, 'uhd-4k.mp4');
const PHOTO = join(FIX, 'photo.jpg');
const OUT = join(import.meta.dirname, '.artifacts');
mkdirSync(OUT, { recursive: true });

async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  // Edge/Chrome умеют H.264; сборка Chromium Playwright — нет
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, args });
    } catch {
      /* следующий вариант */
    }
  }
  return chromium.launch({ args });
}

test('UI: основной сценарий в браузере', { timeout: 15 * 60_000 }, async (t) => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

  try {
    await t.test('Лендинг: Облачко в состоянии «Привет» на первом экране', async () => {
      await page.goto(WEB);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForSelector('canvas', { timeout: 20_000 });
      await page.waitForTimeout(1500);
      await shot('01-landing');
    });

    const email = `ui-${Date.now()}@ain.test`;
    await t.test('Регистрация с согласием на обработку ПД и подтверждение email', async () => {
      await page.goto(`${WEB}/signup`);
      await page.getByLabel('Имя').fill('Айгерим');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Пароль').fill('correct-horse-battery');
      const submit = page.getByRole('button', { name: 'Создать аккаунт' });
      assert.equal(await submit.isDisabled(), true, 'без согласия кнопка неактивна');
      await page.getByRole('checkbox').check();
      await shot('02-signup');
      await submit.click();
      await page.waitForURL('**/verify');
      await page.getByLabel('Код из письма').fill(await mailCode(email));
      await page.getByRole('button', { name: 'Подтвердить' }).click();
      await page.waitForURL('**/drive');
    });

    await t.test('Онбординг: тур Облачка и пустой диск', async () => {
      await page.getByText('Сәлем! Я Облачко').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await shot('03-onboarding');
      await page.getByRole('button', { name: 'Пропустить' }).click();
      await page.getByText('Здесь пока пусто').waitFor();
    });

    await t.test('Из аккаунта открывается главная страница (логотип и пункт «Главная»)', async () => {
      await page.getByRole('link', { name: 'Главная' }).click();
      await page.waitForURL(WEB + '/');
      await page.getByRole('heading', { level: 1, name: /Облако для 4K/ }).waitFor();
      await page.getByRole('link', { name: 'Мои файлы' }).first().click();
      await page.waitForURL('**/drive');
      await page.getByRole('link', { name: 'AIN Cloud' }).first().click();
      await page.waitForURL(WEB + '/');
      await page.goto(WEB + '/drive');
      await page.getByText('Здесь пока пусто').waitFor();
    });

    await t.test('Создание папки', async () => {
      await page.getByRole('button', { name: 'Создать папку' }).click();
      const input = page.getByLabel('Название папки');
      await input.fill('Съёмка Алматы');
      await page.getByRole('button', { name: 'Сохранить' }).click();
      await page.getByRole('link', { name: 'Съёмка Алматы' }).first().click();
      await page.waitForURL('**/drive/folder/**');
      await page.getByRole('heading', { name: 'Съёмка Алматы' }).waitFor();
    });

    await t.test('Загрузка настоящего 4K-файла частями с реальным прогрессом', async () => {
      await page.locator('input[type=file]:not([webkitdirectory])').first().setInputFiles([VIDEO, PHOTO]);
      const panel = page.getByRole('region', { name: 'Очередь загрузок' });
      await panel.waitFor();
      await page.waitForTimeout(700);
      await shot('04-uploading');
      await panel.getByText('Все загрузки завершены').waitFor({ timeout: 5 * 60_000 });
      await shot('05-uploaded');
    });

    await t.test('Файл в каталоге: проверка и обработка, метка 4K по реальным данным', async () => {
      const card = page.getByRole('link', { name: 'uhd-4k.mp4' });
      await card.waitFor();
      await page.getByText('4K', { exact: true }).first().waitFor({ timeout: 5 * 60_000 });
      await page.waitForFunction(() => !document.body.innerText.includes('Создание превью'), null, { timeout: 5 * 60_000 });
      await shot('06-folder');
    });

    await t.test('4K-плеер воспроизводит видео', async () => {
      await page.getByRole('link', { name: 'uhd-4k.mp4' }).click();
      await page.waitForURL('**/drive/file/**');
      const video = page.locator('video');
      await video.waitFor();
      await page.getByRole('button', { name: 'Воспроизвести' }).first().click();
      await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1.5, null, { timeout: 60_000 });
      await page.mouse.move(700, 400);
      await shot('07-player');
      const playing = await video.evaluate((v) => ({ t: v.currentTime, w: v.videoWidth, h: v.videoHeight }));
      assert.ok(playing.t > 1.5, 'видео идёт');
      assert.ok(playing.h >= 480, `кадр ${playing.w}×${playing.h}`);
    });

    await t.test('«Скачать оригинал» отдаёт побайтово тот же файл', async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать оригинал' }).click()]);
      assert.equal(download.suggestedFilename(), 'uhd-4k.mp4');
      const path = await download.path();
      assert.equal(await sha256File(path), await sha256File(VIDEO));
    });

    await t.test('Фото: просмотрщик и EXIF, координаты только владельцу', async () => {
      await page.goto(`${WEB}/drive`);
      await page.getByRole('link', { name: 'Съёмка Алматы' }).first().click();
      await page.getByRole('link', { name: 'photo.jpg' }).click();
      await page.getByText('TestCam').waitFor({ timeout: 120_000 });
      await page.getByText('Координаты съёмки').waitFor();
      await shot('08-photo');
    });

    await t.test('Светлая тема и казахский язык', async () => {
      await page.goto(`${WEB}/settings`);
      await page.getByRole('radio', { name: 'Светлая' }).click();
      await page.getByRole('button', { name: 'KZ' }).first().click();
      await page.getByRole('heading', { name: 'Баптаулар' }).waitFor();
      await shot('09-settings-kk-light');
      await page.getByRole('button', { name: 'RU' }).first().click();
      await page.getByRole('radio', { name: 'Тёмная' }).click();
    });

    await t.test('Телефон 390 px', async () => {
      const mobile = await ctx.newPage();
      await mobile.setViewportSize({ width: 390, height: 844 });
      await mobile.goto(`${WEB}/drive`);
      await mobile.getByRole('link', { name: 'Съёмка Алматы' }).first().waitFor();
      await mobile.waitForTimeout(1500);
      await mobile.screenshot({ path: join(OUT, '10-mobile.png') });
      await mobile.close();
    });

    await t.test('В консоли нет ошибок', () => {
      const relevant = errors.filter((e) => !/favicon|DevTools|Download the React DevTools/.test(e));
      assert.deepEqual(relevant, [], relevant.join(' | '));
    });
  } finally {
    if (errors.length) console.log(`Ошибки браузера: ${errors.join(' | ')}`);
    await shot('99-last').catch(() => undefined);
    await browser.close();
  }
});
