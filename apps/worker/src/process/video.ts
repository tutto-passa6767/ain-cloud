import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Asset, Prisma, PrismaClient } from '@ain/db';
import { cfg } from '../config';
import { deletePrefix, internalUrl, putDir } from '../s3';
import { run, runOk, ToolError } from '../tools';
import { derivedKey, fileExists, makeThumbs, saveDerivative, withWorkDir } from './common';

interface Stream {
  index: number;
  codec_type: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  pix_fmt?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_space?: string;
  channels?: number;
  sample_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: { side_data_type?: string; rotation?: number }[];
  disposition?: { attached_pic?: number };
}

interface Probe {
  streams: Stream[];
  format: { duration?: string; bit_rate?: string; format_name?: string; tags?: Record<string, string> };
}

/** Лестница качеств (ТЗ §7.2). Битрейты — стартовые, уточняются на испытаниях. */
const LADDER = [
  { q: 2160, h264: 40_000, hevc: 18_000 },
  { q: 1440, h264: 16_000, hevc: 8_000 },
  { q: 1080, h264: 8_000, hevc: 4_500 },
  { q: 720, h264: 5_000, hevc: 2_500 },
  { q: 480, h264: 2_500, hevc: 1_200 },
];

const fps = (r?: string) => {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a || 0;
};
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function probe(url: string): Promise<Probe> {
  const r = await runOk('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', url], { timeoutMs: 5 * 60_000 });
  return JSON.parse(r.stdout) as Probe;
}

/** Технические метаданные (ТЗ §8): разрешение, длительность, кодек, частота кадров, битрейт, HDR, аудиодорожки */
export function describe(p: Probe) {
  const video = p.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audios = p.streams.filter((s) => s.codec_type === 'audio');
  const rotation = Math.abs(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(video?.tags?.rotate ?? 0)) % 180;
  // Повёрнутое на 90° видео отображается с переставленными сторонами
  const w = video?.width ?? 0;
  const h = video?.height ?? 0;
  const [width, height] = rotation === 90 ? [h, w] : [w, h];
  const hdr = video?.color_transfer === 'smpte2084' ? 'HDR10' : video?.color_transfer === 'arib-std-b67' ? 'HLG' : null;
  const duration = Number(p.format.duration ?? 0);
  return {
    video,
    width,
    height,
    duration,
    meta: {
      container: p.format.format_name,
      durationSec: duration,
      bitrate: Number(p.format.bit_rate ?? 0) || null,
      video: video
        ? {
            codec: video.codec_name,
            profile: video.profile,
            width,
            height,
            fps: Math.round(fps(video.avg_frame_rate || video.r_frame_rate) * 1000) / 1000,
            bitrate: Number(video.bit_rate ?? 0) || null,
            pixFmt: video.pix_fmt,
            colorTransfer: video.color_transfer,
            colorPrimaries: video.color_primaries,
            hdr,
            rotation,
          }
        : null,
      audio: audios.map((a) => ({
        codec: a.codec_name,
        channels: a.channels,
        sampleRate: Number(a.sample_rate ?? 0) || null,
        bitrate: Number(a.bit_rate ?? 0) || null,
        language: a.tags?.language ?? null,
      })),
    },
    creationTime: p.format.tags?.creation_time ?? video?.tags?.creation_time ?? null,
    location: p.format.tags?.['com.apple.quicktime.location.ISO6709'] ?? p.format.tags?.location ?? null,
    hasAudio: audios.length > 0,
  };
}

function encoderArgs(i: number, kbps: number, gop: number) {
  const codec = cfg.videoCodec;
  const encoder = cfg.videoEncoder || (codec === 'hevc' ? 'libx265' : 'libx264');
  const args = [`-c:v:${i}`, encoder, `-b:v:${i}`, `${kbps}k`, `-maxrate:v:${i}`, `${Math.round(kbps * 1.1)}k`, `-bufsize:v:${i}`, `${kbps * 2}k`];
  if (encoder === 'libx264') args.push(`-preset:v:${i}`, cfg.x264Preset, `-profile:v:${i}`, 'high');
  if (encoder === 'libx265') args.push(`-preset:v:${i}`, 'fast', `-tag:v:${i}`, 'hvc1');
  if (encoder.endsWith('_nvenc')) args.push(`-preset:v:${i}`, 'p5', `-rc:v:${i}`, 'vbr');
  args.push(`-g:v:${i}`, String(gop), `-keyint_min:v:${i}`, String(gop));
  return args;
}

/**
 * Видео (ТЗ §7.2): ffprobe → обложка и миниатюры → анимированное превью 3 сек → HLS-лестница
 * со спрайтом кадров для перемотки за один проход декодирования. Качество выше исходного не создаётся.
 */
export async function processVideo(prisma: PrismaClient, asset: Asset, maxQuality: number, progress: (p: number) => Promise<void>) {
  const url = await internalUrl(cfg.s3.originals, asset.objectKey);
  const p = await probe(url);
  const d = describe(p);
  if (!d.video || !d.width || !d.height) {
    throw new Error('NO_VIDEO_STREAM: в файле нет видеодорожки, которую можно воспроизвести');
  }

  const takenAt = d.creationTime ? new Date(d.creationTime) : null;
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      width: d.width,
      height: d.height,
      durationSec: d.duration || null,
      takenAt: takenAt && !Number.isNaN(takenAt.getTime()) && takenAt.getFullYear() > 1971 ? takenAt : null,
      meta: d.meta as Prisma.InputJsonValue,
      sensitiveMeta: d.location ? { location: d.location } : undefined,
    },
  });

  await withWorkDir(asset.id, async (dir) => {
    const isHdr = !!d.meta.video?.hdr;
    // Тональная компрессия HDR → SDR для версий просмотра; оригинал сохраняет HDR (ТЗ §7.2)
    const toSdr = isHdr
      ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,'
      : '';

    // Обложка: кадр на 10% длительности
    const at = d.duration > 2 ? Math.min(d.duration * 0.1, 30) : 0;
    const poster = join(dir, 'poster.png');
    await runOk('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-ss', String(at), '-i', url, '-frames:v', '1', '-vf', `${toSdr}scale='min(1920,iw)':-2`, poster], { timeoutMs: 10 * 60_000 });
    await makeThumbs(prisma, asset.id, poster, dir);
    await progress(5);

    // Анимированное превью 3 сек (WebP — легче GIF при том же назначении)
    const anim = join(dir, 'animated.webp');
    const animRes = await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-ss', String(at), '-t', '3', '-i', url, '-an', '-vf', `${toSdr}fps=10,scale=320:-2:flags=lanczos`, '-loop', '0', '-c:v', 'libwebp_anim', '-quality', '60', anim], { timeoutMs: 10 * 60_000 });
    if (animRes.code === 0 && (await fileExists(anim))) {
      await saveDerivative(prisma, asset.id, 'ANIMATED', anim, 'image/webp', { width: 320 });
    }
    await progress(8);

    // Лестница: только качества не выше исходного и не выше тарифа владельца
    const shortSide = Math.min(d.width, d.height);
    const srcKbps = (d.meta.video?.bitrate ?? d.meta.bitrate ?? 0) / 1000;
    const srcEfficient = ['hevc', 'av1', 'vp9'].includes(d.meta.video?.codec ?? '');
    let rungs = LADDER.filter((r) => r.q <= shortSide && r.q <= maxQuality);
    if (!rungs.length) rungs = [{ q: even(shortSide), h264: 1_500, hevc: 800 }];
    const portrait = d.height > d.width;
    const variants = rungs.map((r, i) => {
      const target = cfg.videoCodec === 'hevc' ? r.hevc : r.h264;
      // Битрейт версии не выше исходного (с поправкой на эффективность кодека источника)
      const cap = srcKbps ? srcKbps * (srcEfficient && cfg.videoCodec === 'h264' ? 1.6 : 1.0) : target;
      const kbps = Math.round(Math.max(Math.min(target, cap), target * 0.35));
      const scale = portrait ? `scale=${r.q}:-2:flags=lanczos` : `scale=-2:${r.q}:flags=lanczos`;
      const w = portrait ? r.q : even((d.width * r.q) / d.height);
      const h = portrait ? even((d.height * r.q) / d.width) : r.q;
      return { name: `v${i}`, quality: r.q, kbps, scale, width: w, height: h };
    });

    const frameRate = fps(d.video!.avg_frame_rate || d.video!.r_frame_rate) || 30;
    const gop = Math.max(1, Math.round(frameRate * cfg.hlsSegmentSec));
    const interval = Math.max(cfg.spriteIntervalSec, Math.ceil(d.duration / 1000));
    const tiles = Math.max(1, Math.ceil(d.duration / interval));
    const cols = Math.min(10, tiles);
    const rows = Math.ceil(tiles / cols);
    const tileW = portrait ? 90 : 160;
    const tileH = portrait ? 160 : 90;

    const out = join(dir, 'hls');
    for (const v of variants) await mkdir(join(out, v.name), { recursive: true });
    const sprite = join(dir, 'sprite.jpg');

    const split = variants.length + 1;
    const graph = [
      `[0:v:0]${toSdr}format=yuv420p,split=${split}${variants.map((_, i) => `[s${i}]`).join('')}[sp]`,
      ...variants.map((v, i) => `[s${i}]${v.scale}[o${i}]`),
      `[sp]fps=1/${interval},scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}[spr]`,
    ].join(';');

    const args = ['-hide_banner', '-nostdin', '-y', '-i', url, '-filter_complex', graph];
    variants.forEach((v, i) => {
      args.push('-map', `[o${i}]`);
      if (d.hasAudio) args.push('-map', '0:a:0');
      args.push(...encoderArgs(i, v.kbps, gop));
    });
    if (d.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
    args.push(
      '-force_key_frames', `expr:gte(t,n_forced*${cfg.hlsSegmentSec})`,
      '-sc_threshold', '0',
      '-f', 'hls',
      '-hls_time', String(cfg.hlsSegmentSec),
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4',
      '-hls_flags', 'independent_segments',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', join(out, 'v%v', 'seg_%05d.m4s'),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', variants.map((_, i) => (d.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(' '),
      join(out, 'v%v', 'index.m3u8'),
      '-map', '[spr]', '-frames:v', '1', '-q:v', '4', sprite,
      '-progress', 'pipe:1', '-nostats',
    );

    let last = 0;
    const r = await run('ffmpeg', args, {
      onStdoutLine: (line) => {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (!m || !d.duration) return;
        // Реальный прогресс кодирования, а не таймер (ТЗ §6.1, §7.2)
        const pct = Math.min(95, 10 + Math.floor((Number(m[1]) / 1e6 / d.duration) * 85));
        if (pct >= last + 2) {
          last = pct;
          void progress(pct);
        }
      },
    });
    if (r.code !== 0) throw new ToolError('ffmpeg', r.code, r.stderr);

    const prefix = derivedKey(asset.id, 'hls/');
    await deletePrefix(cfg.s3.derived, prefix);
    const hlsBytes = await putDir(cfg.s3.derived, prefix, out);
    await prisma.derivative.upsert({
      where: { assetId_kind: { assetId: asset.id, kind: 'HLS' } },
      update: { objectKey: prefix, mime: 'application/vnd.apple.mpegurl', size: BigInt(hlsBytes), meta: hlsMeta(variants) },
      create: { assetId: asset.id, kind: 'HLS', objectKey: prefix, mime: 'application/vnd.apple.mpegurl', size: BigInt(hlsBytes), meta: hlsMeta(variants) },
    });

    if (await fileExists(sprite)) {
      await saveDerivative(prisma, asset.id, 'SPRITE', sprite, 'image/jpeg', {
        width: cols * tileW,
        height: rows * tileH,
        meta: { interval, cols, rows, tileW, tileH, count: tiles },
      });
    }
  });
}

function hlsMeta(variants: { name: string; quality: number; kbps: number; width: number; height: number }[]): Prisma.InputJsonValue {
  return {
    codec: cfg.videoCodec,
    segmentSec: cfg.hlsSegmentSec,
    renditions: variants.map((v) => ({ name: v.name, quality: v.quality, width: v.width, height: v.height, bandwidth: v.kbps * 1000 })),
  };
}
