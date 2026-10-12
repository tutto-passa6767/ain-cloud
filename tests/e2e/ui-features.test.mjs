// «Фишечки» интерфейса: приветствие, командная палитра, шпаргалка, контекстное меню, превью видео, переходы G → …
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerUser, uploadFile, waitFor } from './lib.mjs';

const require = createRequire(join(import.meta.dirname, '..', '..', 'apps', 'web', 'package.json'));
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const FIX = join(import.meta.dirname, '..', 'fixtures', 'generated');

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

test('Интерфейс: палитра, клавиши, контекстное меню, превью', { timeout: 8 * 60_000 }, async (t) => {
  const { c, email, password } = await registerUser('features');
  await c.patch('/me', { onboarded: true });
  const { assetId } = await uploadFile(c, join(FIX, 'uhd-4k.mp4'), { name: 'Северное сияние.mp4' });
  await waitFor(async () => {
    const a = (await c.get(`/assets/${assetId}`)).data.asset;
    return { done: a.processing === 'READY', value: a.processing };
  }, { timeoutMs: 300_000, intervalMs: 2000, label: 'обработка' });

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(`${WEB}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL('**/drive');
    const card = page.getByRole('link', { name: 'Северное сияние.mp4' });
    await card.waitFor();

    await t.test('Приветствие и сводка хранилища', async () => {
      await page.getByText(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи), Тест$/).waitFor();
      await page.getByText('Файлов: 1').waitFor();
    });

    await t.test('Видео оживает при наведении', async () => {
      await card.hover();
      await page.locator('img[src*="animated"]').waitFor({ timeout: 15_000 });
    });

    await t.test('Правый клик открывает меню действий', async () => {
      await card.click({ button: 'right' });
      const menu = page.getByRole('menu', { name: 'Северное сияние.mp4' });
      await menu.waitFor();
      await menu.getByRole('menuitem', { name: 'В избранное' }).click();
      await page.getByLabel('Избранное', { exact: true }).first().waitFor();
    });

    await t.test('Ctrl+K: палитра находит файл и открывает его', async () => {
      await page.keyboard.press('Control+K');
      await page.getByPlaceholder('Команда или поиск файла…').fill('север');
      await page.getByRole('option', { name: /Северное сияние\.mp4/ }).waitFor();
      await page.keyboard.press('Enter');
      await page.waitForURL(`**/drive/file/${assetId}`);
    });

    await t.test('Палитра выполняет команды: смена темы', async () => {
      const dark = await page.evaluate(() => !document.documentElement.classList.contains('light'));
      await page.keyboard.press('Control+K');
      await page.getByPlaceholder('Команда или поиск файла…').fill('тему');
      await page.keyboard.press('Enter');
      await page.waitForFunction((d) => document.documentElement.classList.contains('light') === d, dark);
      await page.keyboard.press('Control+K');
      await page.getByPlaceholder('Команда или поиск файла…').fill('тему');
      await page.keyboard.press('Enter');
    });

    await t.test('«?» — шпаргалка, «G, D» — переход в «Мои файлы»', async () => {
      await page.keyboard.press('Shift+?');
      await page.getByRole('dialog', { name: 'Горячие клавиши' }).waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('g');
      await page.keyboard.press('d');
      await page.waitForURL(/\/drive$/);
    });

    await t.test('N — новая папка в открытой папке', async () => {
      await page.keyboard.press('n');
      await page.getByLabel('Название папки').fill('Из клавиатуры');
      await page.getByRole('button', { name: 'Сохранить' }).click();
      await page.getByRole('link', { name: 'Из клавиатуры' }).waitFor();
    });

    await t.test('В консоли нет ошибок', () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
});
