import { mkdir } from 'node:fs/promises';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaClient } from '@ain/db';
import { cfg } from './config';
import { housekeeping } from './housekeeping';
import { processPhoto } from './process/photo';
import { processAudio, processPdf } from './process/other';
import { processVideo } from './process/video';
import { verifyAsset } from './verify';

// Имена очередей совпадают с API (apps/api/src/common/queue.service.ts)
const VERIFY_QUEUE = 'ain-verify';
const PROCESS_QUEUE = 'ain-process';
const HOUSEKEEPING_QUEUE = 'ain-housekeeping';

const prisma = new PrismaClient();
const u = new URL(cfg.redisUrl);
const connection = { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined };
const processQueue = new Queue(PROCESS_QUEUE, { connection });

const log = (scope: string, msg: string) => console.log(`${new Date().toISOString()} [${scope}] ${msg}`);

const audit = (action: string, assetId: string, meta: Record<string, unknown>) =>
  prisma.auditEvent.create({ data: { action, targetType: 'asset', targetId: assetId, meta: meta as any } }).catch(() => undefined);

/** Форматы, для которых сайт показывает просмотр; остальное — только хранение и скачивание (ТЗ §3) */
const viewable = (kind: string, ext: string) =>
  kind === 'VIDEO' || kind === 'PHOTO' || kind === 'RAW' || kind === 'AUDIO' || (kind === 'DOCUMENT' && ext === 'pdf');

async function onVerify(job: Job<{ assetId: string }>) {
  const asset = await prisma.asset.findUnique({ where: { id: job.data.assetId } });
  if (!asset || asset.deletedAt) return 'skipped';
  if (!['RECEIVED', 'SCANNING', 'RESTRICTED'].includes(asset.state)) return `skipped (${asset.state})`;

  const outcome = await verifyAsset(prisma, asset, (m) => log('verify', `${asset.id}: ${m}`));
  log('verify', `${asset.id} ${asset.name}: ${outcome}`);
  const fresh = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
  await audit('scan.result', asset.id, { outcome, reason: fresh.stateReason, engine: fresh.scanEngine });
  if (outcome === 'RESTRICTED' && fresh.stateReason?.startsWith('AV_ERROR')) {
    // Администратор уведомляется о невыполненной проверке (ТЗ §10.1)
    log('ALERT', `антивирусная проверка не выполнена для ${asset.id}: ${fresh.stateReason}`);
  }

  // Проверенный (или ограниченный, но не заблокированный) файл получает превью в изолированном обработчике
  if (outcome === 'VERIFIED' || outcome === 'RESTRICTED') {
    if (!viewable(asset.kind, asset.extension)) {
      await prisma.asset.update({ where: { id: asset.id }, data: { processing: 'UNSUPPORTED', processingProgress: 0 } });
      return outcome;
    }
    if (fresh.processing === 'READY') return outcome;
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: asset.ownerId }, include: { plan: true } });
    await prisma.asset.update({ where: { id: asset.id }, data: { processing: 'PENDING', processingProgress: 0, processingError: null } });
    await processQueue.add('process', { assetId: asset.id }, {
      jobId: `process-${asset.id}`,
      priority: owner.plan.queuePriority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }
  return outcome;
}

async function onProcess(job: Job<{ assetId: string }>) {
  const asset = await prisma.asset.findUnique({ where: { id: job.data.assetId } });
  if (!asset || asset.deletedAt) return 'skipped';
  if (asset.state !== 'VERIFIED' && asset.state !== 'RESTRICTED') return `skipped (${asset.state})`;

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: asset.ownerId }, include: { plan: true } });
  await prisma.asset.update({
    where: { id: asset.id },
    data: { processing: 'RUNNING', processingProgress: 1, processingAttempts: { increment: 1 }, processingError: null },
  });
  const progress = async (p: number) => {
    await prisma.asset.update({ where: { id: asset.id }, data: { processingProgress: Math.max(1, Math.min(99, Math.round(p))) } });
    await job.updateProgress(p);
  };

  const started = Date.now();
  try {
    switch (asset.kind) {
      case 'VIDEO':
        await processVideo(prisma, asset, owner.plan.maxVideoHeight, progress);
        break;
      case 'PHOTO':
      case 'RAW':
        await processPhoto(prisma, asset, progress);
        break;
      case 'AUDIO':
        await processAudio(prisma, asset);
        break;
      case 'DOCUMENT':
        await processPdf(prisma, asset);
        break;
      default:
        await prisma.asset.update({ where: { id: asset.id }, data: { processing: 'UNSUPPORTED' } });
        return 'unsupported';
    }
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    // Формат хранится, но просмотр невозможен: это не ошибка и не потеря оригинала — повторы не нужны
    if (/^(NO_VIDEO_STREAM|NO_AUDIO_STREAM|RAW_UNSUPPORTED)/.test(message)) {
      await prisma.asset.update({ where: { id: asset.id }, data: { processing: 'UNSUPPORTED', processingError: message.slice(0, 1000), processingProgress: 0 } });
      return 'unsupported';
    }
    throw e;
  }
  await prisma.asset.update({ where: { id: asset.id }, data: { processing: 'READY', processingProgress: 100, processingError: null } });
  const sec = Math.round((Date.now() - started) / 1000);
  log('process', `${asset.id} ${asset.name}: готово за ${sec} с`);
  await audit('processing.ready', asset.id, { seconds: sec, durationSec: asset.durationSec });
  return 'ready';
}

/** После исчерпания попыток (3) — «Ошибка обработки»; оригинал не трогается, перезапуск — администратором (ТЗ §7.4) */
async function onProcessFailed(job: Job<{ assetId: string }> | undefined, err: Error) {
  if (!job) return;
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  log('process', `${job.data.assetId}: ошибка (попытка ${job.attemptsMade}): ${err.message}`);
  const message = err.message.slice(0, 1000);
  await prisma.asset
    .update({ where: { id: job.data.assetId }, data: final ? { processing: 'FAILED', processingError: message } : { processingError: message, processing: 'PENDING' } })
    .catch(() => undefined);
}

async function main() {
  await mkdir(cfg.workDir, { recursive: true });
  const verifyWorker = new Worker(VERIFY_QUEUE, onVerify, { connection, concurrency: cfg.verifyConcurrency, lockDuration: 60_000 });
  const processWorker = new Worker(PROCESS_QUEUE, onProcess, { connection, concurrency: cfg.processConcurrency, lockDuration: 60_000 });
  const hkWorker = new Worker(HOUSEKEEPING_QUEUE, () => housekeeping(prisma, log), { connection, concurrency: 1 });

  verifyWorker.on('failed', (job, err) => log('verify', `${job?.data.assetId}: ошибка: ${err.message}`));
  processWorker.on('failed', (job, err) => void onProcessFailed(job, err));

  // Обслуживание раз в 10 минут: истёкшие загрузки, очистка корзины
  const hk = new Queue(HOUSEKEEPING_QUEUE, { connection });
  await hk.upsertJobScheduler('housekeeping', { every: 10 * 60_000 }, { name: 'housekeeping', opts: { removeOnComplete: 10, removeOnFail: 20 } });

  log('worker', `запущен: проверка ×${cfg.verifyConcurrency}, обработка ×${cfg.processConcurrency}, кодек ${cfg.videoCodec}`);
  const shutdown = async () => {
    log('worker', 'остановка…');
    await Promise.allSettled([verifyWorker.close(), processWorker.close(), hkWorker.close(), hk.close(), processQueue.close()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
