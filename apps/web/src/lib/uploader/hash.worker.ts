/// <reference lib="webworker" />
// Потоковый SHA-256 всего файла в отдельном потоке: интерфейс не подвисает даже на 50 ГБ.
import { createSHA256 } from 'hash-wasm';

const CHUNK = 16 * 1024 * 1024;

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  const { file } = e.data;
  try {
    const hasher = await createSHA256();
    hasher.init();
    let offset = 0;
    let lastReport = 0;
    while (offset < file.size) {
      const end = Math.min(file.size, offset + CHUNK);
      hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
      offset = end;
      if (offset - lastReport >= 256 * 1024 * 1024 || offset === file.size) {
        lastReport = offset;
        self.postMessage({ type: 'progress', done: offset });
      }
    }
    self.postMessage({ type: 'done', sha256: hasher.digest('hex') });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message });
  }
};
