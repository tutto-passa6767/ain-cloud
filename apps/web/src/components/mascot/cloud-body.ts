// Сетка тела Облачка (OPEN_CLOUD, упрощена до 20 000 треугольников скриптом scripts/mascot-body.mjs).
// Отдельный файл в public: грузится после основного содержимого и кэшируется браузером.

export interface CloudBody {
  s: number;
  pos: Int16Array;
  nor: Int16Array;
  col: Uint8Array;
  idx: Uint16Array;
}

let pending: Promise<CloudBody> | null = null;

export function loadCloudBody(): Promise<CloudBody> {
  pending ??= fetch('/mascot/cloud-body.bin')
    .then((r) => {
      if (!r.ok) throw new Error(`cloud-body.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then(parse)
    .catch((e) => {
      pending = null;
      throw e;
    });
  return pending;
}

function parse(buf: ArrayBuffer): CloudBody {
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'ACB1') throw new Error('cloud-body.bin: неизвестный формат');
  const nV = dv.getUint32(4, true);
  const nI = dv.getUint32(8, true);
  const align = (n: number) => (n + 3) & ~3;
  const oPos = 16;
  const oNor = align(oPos + nV * 6);
  const oCol = align(oNor + nV * 6);
  const oIdx = align(oCol + nV * 3);
  return {
    s: dv.getFloat32(12, true),
    pos: new Int16Array(buf, oPos, nV * 3),
    nor: new Int16Array(buf, oNor, nV * 3),
    col: new Uint8Array(buf, oCol, nV * 3),
    idx: new Uint16Array(buf, oIdx, nI),
  };
}
