// Приёмка маскота Облачко (ТЗ маскота §12): сценарий загрузки по реальным событиям, «Радость» 4 секунды,
// «Спит» в пустой корзине, «Растерян» без доступа, приоритет и реплики.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerUser } from './lib.mjs';

const require = createRequire(join(import.meta.dirname, '..', '..', 'apps', 'web', 'package.json'));
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const OUT = join(import.meta.dirname, '.artifacts');
const VIDEO = join(import.meta.dirname, '..', 'fixtures', 'generated', 'uhd-4k.mp4');

async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, args });
    } catch {
      /* следующий вариант */
    }
  }
  return chromium.launch({ args });
}

test('Облачко: состояния по событиям сайта', { timeout: 6 * 60_000 }, async (t) => {
  const { c, email, password } = await registerUser('cloud');
  await c.patch('/me', { onboarded: true });
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const mood = () => page.locator('[data-mascot-mood]').getAttribute('data-mascot-mood');
  const waitMood = (m, timeout = 30_000) => page.locator(`[data-mascot-mood="${m}"]`).waitFor({ state: 'attached', timeout });
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
  let happyAt = 0;

  try {
    await page.goto(`${WEB}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL('**/drive');

    await t.test('Пустой диск — «Ожидание»', async () => {
      await page.getByText('Здесь пока пусто').waitFor();
      await waitMood('idle');
      // 3D-холст подгрузился после основного содержимого
      await page.locator('[data-mascot-mood] canvas').waitFor({ state: 'attached', timeout: 30_000 });
    });

    await t.test('Загрузка: Думает → (обрыв) Злой → (связь вернулась) Думает → Радость', async () => {
      const firstPart = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes(':59000'), { timeout: 120_000 });
      await page.locator('input[type=file]:not([webkitdirectory])').first().setInputFiles([VIDEO]);
      await waitMood('think');
      await page.getByText('Загружаю «uhd-4k.mp4»').waitFor();

      await firstPart;
      await context.setOffline(true);
      await waitMood('angry');
      const alert = page.getByRole('alert').filter({ hasText: 'Связь оборвалась, загрузка на паузе' });
      await alert.waitFor();
      await page.waitForTimeout(1200);
      await shot('60-cloud-angry');
      // Важная реплика не исчезает сама через 5 секунд
      await page.waitForTimeout(5500);
      assert.equal(await alert.count(), 1, 'реплика об обрыве держится, пока связи нет');
      assert.equal(await mood(), 'angry');

      await context.setOffline(false);
      await page.getByText('Сеть вернулась! Продолжаю…').waitFor({ timeout: 30_000 });
      await page.getByText('Готово! «uhd-4k.mp4» загружено.').waitFor({ timeout: 180_000 });
      assert.equal(await mood(), 'happy');
      happyAt = Date.now();
      await shot('61-cloud-happy');
    });

    await t.test('«Радость» держится 4 секунды, затем следующее по приоритету состояние', async () => {
      await page.waitForFunction(() => document.querySelector('[data-mascot-mood]')?.getAttribute('data-mascot-mood') !== 'happy', null, { timeout: 10_000 });
      const held = Date.now() - happyAt;
      assert.ok(held > 3000 && held < 6500, `«Радость» держалась ${held} мс`);
      // Видео ещё обрабатывается — «Думает»; иначе — «Ожидание»
      assert.ok(['think', 'idle'].includes(await mood()), await mood());
    });

    await t.test('Пустая корзина — «Спит»', async () => {
      await page.goto(`${WEB}/trash`);
      await waitMood('sleep');
    });

    await t.test('Нет доступа к файлу — «Растерян» с репликой', async () => {
      await page.goto(`${WEB}/drive/file/00000000-0000-4000-8000-000000000000`);
      await waitMood('confused');
      await page.getByText('Этот файл закрыт для вас').first().waitFor();
      await page.waitForTimeout(1200);
      await shot('62-cloud-confused');
    });

    await t.test('Страница 404 — растерянное Облачко предлагает вернуться в «Мои файлы»', async () => {
      await page.goto(`${WEB}/no-such-page`);
      await page.getByText('Хм, такой страницы нет. Вернёмся в «Мои файлы»?').waitFor();
    });
  } finally {
    await browser.close();
  }
});
