// Облачко можно переставить мышью, пальцем или стрелками (кроме онбординга); место запоминается.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerUser } from './lib.mjs';

const require = createRequire(join(import.meta.dirname, '..', '..', 'apps', 'web', 'package.json'));
const { chromium } = require('playwright');
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const OUT = join(import.meta.dirname, '.artifacts');

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

test('Маскот: свободное перемещение, кроме онбординга', { timeout: 5 * 60_000 }, async (t) => {
  const { email, password } = await registerUser('mascot');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const mascot = page.getByRole('button', { name: /^Облачко/ });
  /** Центр и нижний отступ контейнера маскота */
  const where = async () => {
    const b = await mascot.boundingBox();
    return { cx: b.x + b.width / 2, bottom: 900 - (b.y + b.height) };
  };
  const dragBy = async (dx, dy) => {
    const b = await mascot.boundingBox();
    const sx = b.x + b.width / 2;
    const sy = b.y + b.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(sx + (dx * i) / 10, sy + (dy * i) / 10);
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  try {
    await page.goto(`${WEB}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL('**/drive');
    await page.getByText('Сәлем! Я Облачко').waitFor({ timeout: 30_000 });
    await mascot.waitFor();
    await page.waitForTimeout(800);

    await t.test('Во время онбординга Облачко стоит на месте и не перетаскивается', async () => {
      const before = await where();
      await dragBy(-500, -300);
      const after = await where();
      assert.ok(Math.abs(after.cx - before.cx) < 2 && Math.abs(after.bottom - before.bottom) < 2, JSON.stringify({ before, after }));
      await page.getByRole('button', { name: 'Пропустить' }).click();
    });

    await t.test('После онбординга его можно поставить в любое место экрана', async () => {
      await page.waitForTimeout(500);
      const before = await where();
      await dragBy(-600, -350);
      const after = await where();
      assert.ok(before.cx - after.cx > 500, `сдвиг по горизонтали: ${before.cx} → ${after.cx}`);
      assert.ok(after.bottom - before.bottom > 300, `поднят над нижним краем: ${before.bottom} → ${after.bottom}`);
      await page.screenshot({ path: join(OUT, '50-mascot-dragged.png') });
    });

    await t.test('Отпускание после перетаскивания — не клик (реплика не появляется)', async () => {
      assert.equal(await page.getByText('Я берегу ваши оригиналы — байт в байт.').count(), 0);
    });

    await t.test('Место запоминается после перезагрузки', async () => {
      const placed = await where();
      await page.reload();
      await mascot.waitFor();
      await page.waitForTimeout(1500);
      const again = await where();
      assert.ok(Math.abs(again.cx - placed.cx) < 3 && Math.abs(again.bottom - placed.bottom) < 3, JSON.stringify({ placed, again }));
    });

    await t.test('Стрелки клавиатуры переставляют Облачко', async () => {
      const before = await where();
      await mascot.focus();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Shift+ArrowRight');
      const after = await where();
      assert.ok(after.bottom - before.bottom >= 15, 'вверх на шаг');
      assert.ok(after.cx - before.cx >= 60, 'вправо на крупный шаг');
    });

    await t.test('«Вернуть на место» возвращает его к нижнему краю', async () => {
      await mascot.hover();
      await page.getByRole('button', { name: 'Меню Облачка' }).click();
      await page.getByRole('menuitem', { name: 'Вернуть на место' }).click();
      await page.waitForTimeout(600);
      const back = await where();
      assert.ok(back.bottom < 10, `у нижнего края: ${back.bottom}`);
    });
  } finally {
    await browser.close();
  }
});
