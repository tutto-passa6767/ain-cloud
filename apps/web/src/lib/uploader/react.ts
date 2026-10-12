'use client';

import { useSyncExternalStore } from 'react';
import { getUploadManager, type UploadItem } from './manager';

const EMPTY: UploadItem[] = [];

export function useUploads(): UploadItem[] {
  const m = getUploadManager();
  return useSyncExternalStore(m.subscribe, m.getSnapshot, () => EMPTY);
}

export { getUploadManager };

/**
 * Файлы из перетаскивания, включая целые папки (webkitGetAsEntry).
 * Путь — список папок относительно места, куда бросили.
 */
export async function filesFromDrop(dt: DataTransfer): Promise<{ file: File; path: string[] }[]> {
  const out: { file: File; path: string[] }[] = [];
  const entries = [...dt.items].map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null)).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) {
    return [...dt.files].map((file) => ({ file, path: [] }));
  }
  const walk = async (entry: FileSystemEntry, path: string[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries отдаёт содержимое порциями — читаем до пустого ответа
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, [...path, entry.name]);
      }
    }
  };
  for (const e of entries) await walk(e, []);
  return out;
}

/** Файлы из input[webkitdirectory]: путь берётся из webkitRelativePath */
export function filesFromInput(list: FileList | null): { file: File; path: string[] }[] {
  if (!list) return [];
  return [...list].map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const parts = rel.split('/').filter(Boolean);
    return { file, path: parts.slice(0, -1) };
  });
}
