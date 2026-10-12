'use strict';
// Начальные данные: тарифы (ТЗ §16) и настройки, которые администратор меняет в админ-панели (ТЗ §15).
// Цены задаёт заказчик — здесь только лимиты.
const { PrismaClient } = require('@prisma/client');

const GiB = 1024n ** 3n;
const TiB = 1024n ** 4n;

const plans = [
  {
    code: 'FREE', name: 'Free', sortOrder: 0,
    quotaBytes: 10n * GiB, maxFileBytes: 5n * GiB, maxVideoHeight: 1080, queuePriority: 10,
    features: { passwordLinks: false, uploadLinks: false, comments: false, versions: false, teams: false },
  },
  {
    code: 'PRO', name: 'Pro', sortOrder: 1,
    quotaBytes: 1n * TiB, maxFileBytes: 50n * GiB, maxVideoHeight: 2160, queuePriority: 3,
    features: { passwordLinks: true, uploadLinks: false, comments: true, versions: true, teams: false },
  },
  {
    code: 'PRO_MAX', name: 'Pro Max', sortOrder: 2,
    quotaBytes: 5n * TiB, maxFileBytes: 50n * GiB, maxVideoHeight: 2160, queuePriority: 2,
    features: { passwordLinks: true, uploadLinks: true, comments: true, versions: true, teams: false },
  },
  {
    code: 'BUSINESS', name: 'Business', sortOrder: 3,
    quotaBytes: 10n * TiB, maxFileBytes: 50n * GiB, maxVideoHeight: 2160, queuePriority: 1,
    features: { passwordLinks: true, uploadLinks: true, comments: true, versions: true, teams: true },
  },
];

// Разрешённые форматы (ТЗ §3). Список не является неограниченным и меняется администратором.
const allowedFormats = {
  VIDEO: ['mp4', 'mov', 'mkv', 'avi'],
  PHOTO: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff'],
  RAW: ['dng', 'cr2', 'cr3', 'nef', 'arw'],
  AUDIO: ['mp3', 'wav', 'flac', 'm4a'],
  DOCUMENT: ['pdf', 'docx', 'xlsx', 'pptx'],
  ARCHIVE: ['zip'],
};

const settings = {
  'formats.allowed': allowedFormats,
  'upload.partSizeMb': 64,
  'upload.parallelParts': 4,
  'upload.sessionTtlDays': 7,
  'trash.retentionDays': 30,
  'processing.maxAttempts': 3,
};

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const p of plans) {
      await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
    }
    for (const [key, value] of Object.entries(settings)) {
      await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
    }
    console.log(`Тарифов: ${plans.length}, настроек: ${Object.keys(settings).length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
