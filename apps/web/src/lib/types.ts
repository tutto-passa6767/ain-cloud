export type AssetKind = 'VIDEO' | 'PHOTO' | 'RAW' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'OTHER';
export type AssetState = 'UPLOADING' | 'RECEIVED' | 'CORRUPTED' | 'SCANNING' | 'VERIFIED' | 'RESTRICTED' | 'BLOCKED';
export type Processing = 'NONE' | 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'UNSUPPORTED';
export type MascotMode = 'ON' | 'COLLAPSED' | 'OFF';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'MODERATOR' | 'SUPPORT' | 'ACCOUNTANT' | 'ADMIN';
  planCode: 'FREE' | 'PRO' | 'PRO_MAX' | 'BUSINESS';
  emailVerifiedAt: string | null;
  locale: 'ru' | 'kk' | 'en';
  theme: 'DARK' | 'LIGHT';
  mascotMode: MascotMode;
  onboardedAt: string | null;
  totpEnabledAt: string | null;
}

export interface Me {
  user: User | null;
  plan?: { code: string; name: string; quotaBytes: number; maxFileBytes: number; maxVideoHeight: number; features: Record<string, boolean> };
  usage?: { usedBytes: number; reservedBytes: number; quotaBytes: number };
  stats?: { files: number; folders: number; processing: number };
  upload?: { partSize: number; parallelParts: number };
  formats?: Partial<Record<AssetKind, string[]>>;
}

export interface FolderItem {
  type: 'folder';
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCard {
  type: 'asset';
  id: string;
  name: string;
  extension: string;
  kind: AssetKind;
  size: number;
  folderId: string | null;
  state: AssetState;
  stateReason: string | null;
  processing: Processing;
  processingProgress: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  takenAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  starred: boolean;
  color: string | null;
  tags: string[];
  thumbSm: string | null;
  thumbLg: string | null;
  /** Анимированное превью видео для наведения */
  animated: string | null;
}

export interface AssetDetail extends AssetCard {
  originalName: string;
  description: string;
  detectedMime: string | null;
  sha256: string | null;
  sha256Client: string | null;
  processingError: string | null;
  meta: any;
  exif: Record<string, unknown> | null;
  sensitiveMeta: Record<string, unknown> | null;
  preview: string | null;
  animated: string | null;
  sprite: { url: string; interval: number; cols: number; rows: number; tileW: number; tileH: number; count: number } | null;
  hls: { renditions: { name: string; quality: number; width: number; height: number; bandwidth: number }[] } | null;
  lastOpenedAt: string | null;
}

export interface DriveListing {
  folder: FolderItem | null;
  path: { id: string; name: string }[];
  folders: FolderItem[];
  assets: AssetCard[];
}

export type Item = FolderItem | AssetCard;
