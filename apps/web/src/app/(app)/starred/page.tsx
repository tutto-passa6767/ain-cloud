'use client';

import { DriveView } from '@/components/drive/drive-view';
import { useI18n } from '@/i18n';

export default function StarredPage() {
  const { t } = useI18n();
  return <DriveView mode="starred" title={t('nav.starred')} emptyText={t('drive.starredEmpty')} />;
}
