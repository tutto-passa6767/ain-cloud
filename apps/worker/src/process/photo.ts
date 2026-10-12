import { join } from 'node:path';
import type { Asset, Prisma, PrismaClient } from '@ain/db';
import { cfg } from '../config';
import { download } from '../s3';
import { run } from '../tools';
import { fileExists, imageSize, makeThumbs, readExif, saveDerivative, vipsResize, withWorkDir } from './common';

/**
 * Фото и RAW (ТЗ §7.3): миниатюры WebP 256/1024 и версия для просмотра 2560 px, EXIF.
 * Для RAW берётся встроенное превью камеры, а если его нет — декодирование через LibRaw.
 */
export async function processPhoto(prisma: PrismaClient, asset: Asset, progress: (p: number) => Promise<void>) {
  return withWorkDir(asset.id, async (dir) => {
    const src = join(dir, `original.${asset.extension}`);
    await download(cfg.s3.originals, asset.objectKey, src);
    await progress(20);

    const info = await readExif(src);
    let viewable = src;
    if (asset.kind === 'RAW') {
      viewable = await rawPreview(src, dir);
    }
    await progress(40);

    const size = await imageSize(viewable).catch(() => null);
    const width = (info.exif.ImageWidth as number) || size?.width || null;
    const height = (info.exif.ImageHeight as number) || size?.height || null;

    await makeThumbs(prisma, asset.id, viewable, dir);
    await progress(70);
    const preview = join(dir, 'preview.webp');
    const pv = await vipsResize(viewable, preview, 2560, 85);
    await saveDerivative(prisma, asset.id, 'PREVIEW', preview, 'image/webp', pv);

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        width,
        height,
        takenAt: info.takenAt,
        exif: info.exif as Prisma.InputJsonValue,
        sensitiveMeta: Object.keys(info.sensitive).length ? (info.sensitive as Prisma.InputJsonValue) : undefined,
        meta: { kind: asset.kind, mime: asset.detectedMime, raw: asset.kind === 'RAW' },
      },
    });
  });
}

async function rawPreview(src: string, dir: string): Promise<string> {
  // Самое крупное встроенное превью: JpgFromRaw → PreviewImage → OtherImage
  for (const tag of ['JpgFromRaw', 'PreviewImage', 'OtherImage']) {
    const out = join(dir, `embedded_${tag}.jpg`);
    const r = await run('sh', ['-c', `exiftool -b -${tag} "$1" > "$2"`, 'sh', src, out], { timeoutMs: 120_000 });
    if (r.code === 0 && (await fileExists(out))) {
      const s = await imageSize(out).catch(() => null);
      if (s && Math.max(s.width, s.height) >= 1024) return out;
    }
  }
  // Полное декодирование LibRaw в 16-битный TIFF
  const r = await run('dcraw_emu', ['-T', '-w', '-o', '1', '-q', '3', src], { timeoutMs: 15 * 60_000 });
  const tiff = `${src}.tiff`;
  if (r.code === 0 && (await fileExists(tiff))) return tiff;
  throw new Error('RAW_UNSUPPORTED: нет встроенного превью и LibRaw не смог декодировать файл');
}
