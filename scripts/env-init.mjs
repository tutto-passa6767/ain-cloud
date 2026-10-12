// Создаёт .env из .env.example: подставляет случайные секреты и раскрывает ${VAR}.
// Существующий .env не перезаписывается (используйте --force).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
if (existsSync(target) && !process.argv.includes('--force')) {
  console.log('.env уже существует — пропускаю (используйте --force для перезаписи)');
  process.exit(0);
}

const src = readFileSync(join(root, '.env.example'), 'utf8');
const values = {};
const out = src.split(/\r?\n/).map((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) return line;
  let [, key, value] = m;
  value = value
    .replace(/__RANDOM_B64_32__/g, () => randomBytes(32).toString('base64'))
    .replace(/__RANDOM__/g, () => randomBytes(18).toString('base64url'))
    .replace(/\$\{([A-Z0-9_]+)\}/g, (_, ref) => values[ref] ?? '');
  values[key] = value;
  return `${key}=${value}`;
});
writeFileSync(target, out.join('\n'));
console.log('Создан .env со случайными секретами');
