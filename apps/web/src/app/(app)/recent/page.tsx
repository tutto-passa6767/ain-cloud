'use client';

import { DriveView } from '@/components/drive/drive-view';
import { useI18n } from '@/i18n';

export default function RecentPage() {
  const { t } = useI18n();
  return <DriveView mode="recent" title={t('nav.recent')} emptyText={t('drive.recentEmpty')} />;
}
