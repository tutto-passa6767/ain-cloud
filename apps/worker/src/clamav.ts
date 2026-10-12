import { connect } from 'node:net';
import type { Readable } from 'node:stream';
import { cfg } from './config';

export type ScanResult =
  | { status: 'clean'; engine: string }
  | { status: 'infected'; signature: string; engine: string }
  | { status: 'error'; reason: string };

const CHUNK = 1024 * 1024;

/** Версия движка и баз — сохраняется вместе с результатом проверки */
export function clamVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(cfg.clamav.port, cfg.clamav.host);
    let out = '';
    sock.setTimeout(10_000, () => sock.destroy(new Error('таймаут ClamAV')));
    sock.on('connect', () => sock.write('zVERSION\0'));
    sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () => resolve(out.replace(/\0/g, '').trim()));
    sock.on('error', reject);
  });
}

/**
 * Потоковая проверка через протокол clamd INSTREAM: данные передаются кусками
 * [длина 4 байта BE][данные], конец — кусок нулевой длины.
 */
export async function scanStream(stream: Readable): Promise<ScanResult> {
  let engine = 'ClamAV';
  try {
    engine = await clamVersion();
  } catch (e) {
    return { status: 'error', reason: `ClamAV недоступен: ${(e as Error).message}` };
  }

  return new Promise<ScanResult>((resolve) => {
    const sock = connect(cfg.clamav.port, cfg.clamav.host);
    let reply = '';
    let settled = false;
    const done = (r: ScanResult) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(10 * 60_000, () => done({ status: 'error', reason: 'таймаут проверки ClamAV' }));
    sock.on('error', (e) => done({ status: 'error', reason: `ошибка ClamAV: ${e.message}` }));
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => {
      const text = reply.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(text)) done({ status: 'clean', engine });
      else if (/FOUND$/.test(text)) done({ status: 'infected', signature: text.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, ''), engine });
      else done({ status: 'error', reason: text || 'пустой ответ ClamAV' });
    });

    sock.on('connect', async () => {
      sock.write('zINSTREAM\0');
      try {
        for await (const chunk of stream) {
          const buf = chunk as Buffer;
          for (let i = 0; i < buf.length; i += CHUNK) {
            const part = buf.subarray(i, i + CHUNK);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(part.length);
            if (!sock.write(Buffer.concat([len, part]))) {
              await new Promise((r) => sock.once('drain', r));
            }
            if (settled) return;
          }
        }
        sock.write(Buffer.from([0, 0, 0, 0]));
      } catch (e) {
        done({ status: 'error', reason: `ошибка чтения файла: ${(e as Error).message}` });
      }
    });
  });
}
