import { join } from 'node:path';
import type { Asset, Prisma, PrismaClient } from '@ain/db';
import { cfg } from '../config';
import { download, internalUrl } from '../s3';
import { runOk } from '../tools';
import { makeThumbs, withWorkDir } from './common';
import { describe, probe } from './video';

/** Аудио: метаданные; воспроизводится оригинал, если формат поддерживает браузер (ТЗ §3) */
export async function processAudio(prisma: PrismaClient, asset: Asset) {
  const p = await probe(await internalUrl(cfg.s3.originals, asset.objectKey));
  const d = describe(p);
  if (!d.hasAudio) throw new Error('NO_AUDIO_STREAM: в файле нет аудиодорожки');
  const tags = p.format.tags ?? {};
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      durationSec: d.duration || null,
      meta: { ...d.meta, title: tags.title ?? null, artist: tags.artist ?? null, album: tags.album ?? null } as Prisma.InputJsonValue,
    },
  });
}

/** PDF: миниатюра первой страницы; сам документ открывается в изолированном просмотрщике */
export async function processPdf(prisma: PrismaClient, asset: Asset) {
  await withWorkDir(asset.id, async (dir) => {
    const src = join(dir, 'doc.pdf');
    await download(cfg.s3.originals, asset.objectKey, src);
    const info = await runOk('pdfinfo', [src], { timeoutMs: 60_000 });
    const pages = Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1] ?? 0) || null;
    const base = join(dir, 'page');
    await runOk('pdftoppm', ['-f', '1', '-l', '1', '-png', '-r', '110', '-singlefile', src, base], { timeoutMs: 120_000 });
    await makeThumbs(prisma, asset.id, `${base}.png`, dir);
    await prisma.asset.update({ where: { id: asset.id }, data: { meta: { pages } } });
  });
}
