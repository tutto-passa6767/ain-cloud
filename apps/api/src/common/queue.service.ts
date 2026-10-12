import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { cfg } from '../config';

/** Очереди медиаобработчика: быстрая проверка и тяжёлая обработка не мешают друг другу */
export const VERIFY_QUEUE = 'ain-verify';
export const PROCESS_QUEUE = 'ain-process';

export interface AssetJob {
  assetId: string;
}

export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
  };
}

/** Постановка задач в очередь обработки (ТЗ §7: обработка идёт через отдельную очередь задач) */
@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly verify = new Queue<AssetJob>(VERIFY_QUEUE, { connection: redisConnection(cfg.redisUrl) });
  readonly process = new Queue<AssetJob>(PROCESS_QUEUE, { connection: redisConnection(cfg.redisUrl) });

  /** jobId делает постановку идемпотентной: повторное завершение загрузки не создаёт дубликат задачи */
  async enqueueVerify(assetId: string, priority: number) {
    await this.verify.add('verify', { assetId }, {
      jobId: `verify-${assetId}`,
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  /** Повторная проверка (например, когда антивирус был недоступен) */
  async enqueueRescan(assetId: string, priority: number) {
    await this.verify.add('verify', { assetId }, {
      jobId: `verify-${assetId}-${Date.now()}`,
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  /** Повторная обработка (перезапуск администратором или после смены тарифа) */
  async enqueueProcess(assetId: string, priority: number) {
    await this.process.add('process', { assetId }, {
      jobId: `process-${assetId}-${Date.now()}`,
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.verify.close(), this.process.close()]);
  }
}
