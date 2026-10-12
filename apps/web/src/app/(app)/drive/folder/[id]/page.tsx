'use client';

import { useParams } from 'next/navigation';
import { DriveView } from '@/components/drive/drive-view';

export default function FolderPage() {
  const { id } = useParams<{ id: string }>();
  return <DriveView key={id} mode="folder" folderId={id} />;
}
