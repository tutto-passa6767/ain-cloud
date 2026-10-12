import { Injectable } from '@nestjs/common';
import { AssetKind } from '@ain/db';
import { PrismaService } from './prisma.service';

export type AllowedFormats = Partial<Record<AssetKind, string[]>>;

const DEFAULT_FORMATS: AllowedFormats = {
  VIDEO: ['mp4', 'mov', 'mkv', 'avi'],
  PHOTO: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff'],
  RAW: ['dng', 'cr2', 'cr3', 'nef', 'arw'],
  AUDIO: ['mp3', 'wav', 'flac', 'm4a'],
  DOCUMENT: ['pdf', 'docx', 'xlsx', 'pptx'],
  ARCHIVE: ['zip'],
};

/** Настройки, которые администратор меняет без разработчиков (ТЗ §15). Кэш — 30 секунд. */
@Injectable()
export class SettingsService {
  private cache: { at: number; values: Map<string, unknown> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async all(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.values;
    const rows = await this.prisma.setting.findMany();
    const values = new Map(rows.map((r) => [r.key, r.value as unknown]));
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const v = (await this.all()).get(key);
    return (v ?? fallback) as T;
  }

  invalidate() {
    this.cache = null;
  }

  async allowedFormats(): Promise<AllowedFormats> {
    return this.get<AllowedFormats>('formats.allowed', DEFAULT_FORMATS);
  }

  /** Категория по расширению или null, если формат не разрешён */
  async kindForExtension(ext: string): Promise<AssetKind | null> {
    const formats = await this.allowedFormats();
    for (const [kind, list] of Object.entries(formats)) {
      if (list?.includes(ext)) return kind as AssetKind;
    }
    return null;
  }
}
