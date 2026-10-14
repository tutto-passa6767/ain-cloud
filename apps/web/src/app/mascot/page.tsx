import type { Metadata } from 'next';
import { MascotPreview } from './preview';

// Страница для приёмки маскота заказчиком (ТЗ маскота §12); в навигации не показывается
export const metadata: Metadata = { title: 'Облачко', robots: { index: false, follow: false } };

export default function MascotPage() {
  return <MascotPreview />;
}
