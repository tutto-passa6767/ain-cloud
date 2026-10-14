// Упрощает сетку тела Облачка (OPEN_CLOUD / Cloud_Body) до бюджета ТЗ маскота §9, §11: ≤ 20 000 треугольников, модель ≤ 1 МБ.
// Вход: mascot/cloud/cloud_body_data.js (исходник заказчика, в Git не хранится).
// Выход: apps/web/public/mascot/cloud-body.bin — читает apps/web/src/components/mascot/cloud-body.ts.
//
// Запуск (meshoptimizer нужен только здесь, в зависимости проекта не входит):
//   npm i --no-save meshoptimizer@0.22.0 && node scripts/mascot-body.mjs [треугольников]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { CLOUD_BODY_DATA: D } = require(join(root, 'mascot', 'cloud', 'cloud_body_data.js'));
const TARGET_TRIS = Number(process.argv[2] ?? 20000);

const bytes = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};
const pos16 = new Int16Array(bytes(D.pos));
const nor16 = new Int16Array(bytes(D.nor));
const col8 = new Uint8Array(bytes(D.col));
const idx32 = new Uint32Array(bytes(D.idx));
const V = pos16.length / 3;

const positions = new Float32Array(V * 3);
const attrs = new Float32Array(V * 6); // нормаль + цвет вершины (запечённый румянец)
for (let i = 0; i < V; i++) {
  for (let a = 0; a < 3; a++) {
    positions[i * 3 + a] = (pos16[i * 3 + a] / 32767) * D.s;
    attrs[i * 6 + a] = nor16[i * 3 + a] / 32767;
    attrs[i * 6 + 3 + a] = col8[i * 3 + a] / 255;
  }
}

await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
// Цвет весит больше нормали: граница румянца должна остаться мягкой и на месте
const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(idx32, positions, 3, attrs, 6, [0.4, 0.4, 0.4, 1.2, 1.2, 1.2], null, TARGET_TRIS * 3, 0.01);

// Оставляем только используемые вершины
const remap = new Int32Array(V).fill(-1);
const order = [];
const idx = new Uint16Array(simplified.length);
for (let i = 0; i < simplified.length; i++) {
  const v = simplified[i];
  if (remap[v] < 0) {
    remap[v] = order.length;
    order.push(v);
  }
  idx[i] = remap[v];
}
const nV = order.length;
if (nV > 65535) throw new Error(`Вершин ${nV} — не помещаются в 16-битные индексы, уменьшите цель`);

// Формат: «ACB1», число вершин, число индексов, масштаб; затем позиции int16, нормали int16, цвета uint8, индексы uint16
const align = (n) => (n + 3) & ~3;
const oPos = 16;
const oNor = align(oPos + nV * 6);
const oCol = align(oNor + nV * 6);
const oIdx = align(oCol + nV * 3);
const size = oIdx + idx.length * 2;
const out = new ArrayBuffer(size);
const dv = new DataView(out);
new Uint8Array(out, 0, 4).set(Buffer.from('ACB1'));
dv.setUint32(4, nV, true);
dv.setUint32(8, idx.length, true);
dv.setFloat32(12, D.s, true);
const P = new Int16Array(out, oPos, nV * 3);
const N = new Int16Array(out, oNor, nV * 3);
const C = new Uint8Array(out, oCol, nV * 3);
order.forEach((v, i) => {
  for (let a = 0; a < 3; a++) {
    P[i * 3 + a] = pos16[v * 3 + a];
    N[i * 3 + a] = nor16[v * 3 + a];
    C[i * 3 + a] = col8[v * 3 + a];
  }
});
new Uint16Array(out, oIdx, idx.length).set(idx);

const file = join(root, 'apps', 'web', 'public', 'mascot', 'cloud-body.bin');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, Buffer.from(out));
console.log(
  `Треугольников: ${idx32.length / 3} → ${idx.length / 3}, вершин: ${V} → ${nV}, отклонение ${(error * 100).toFixed(2)}%, ` +
    `файл ${(size / 1024).toFixed(0)} КБ (gzip ${(gzipSync(Buffer.from(out)).length / 1024).toFixed(0)} КБ)`,
);
