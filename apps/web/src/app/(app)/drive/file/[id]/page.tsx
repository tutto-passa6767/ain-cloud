'use client';

import { useParams } from 'next/navigation';
import { FileView } from '@/components/file/file-view';

export default function FilePage() {
  const { id } = useParams<{ id: string }>();
  return <FileView key={id} id={id} />;
}
