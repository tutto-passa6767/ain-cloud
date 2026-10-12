import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AIN Cloud — облако для 4K-видео и RAW-фото', template: '%s · AIN Cloud' },
  description: 'Храните, смотрите и передавайте 4K-видео и RAW-фото. Оригиналы хранятся без изменений.',
  applicationName: 'AIN Cloud',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#060a10',
  width: 'device-width',
  initialScale: 1,
};

// Тема применяется до первой отрисовки, чтобы не было вспышки светлого/тёмного фона
const themeScript = `try{if(localStorage.getItem('ain-theme')==='LIGHT')document.documentElement.classList.add('light')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Живой фон под матовым стеклом: размытые пятна фирменных цветов и зерно */}
        <div className="app-backdrop" aria-hidden>
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
        </div>
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[70] rounded-lg bg-accent px-3 py-2 text-accent-fg">
          К содержимому
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
