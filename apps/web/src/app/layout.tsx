import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// Кириллица с расширением — для казахских букв (ә, ғ, қ, ң, ө, ұ, ү, һ)
const sans = Inter_Tight({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-inter-tight', display: 'swap' });
// Курсивный акцент в крупных заголовках
// Подписи «как на мониторе камеры»: таймкод, метки разделов
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-jetbrains', display: 'swap' });
const serif = Cormorant_Garamond({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], weight: '500', style: 'italic', variable: '--font-cormorant', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AIN Cloud — облако для 4K-видео и RAW-фото', template: '%s · AIN Cloud' },
  description: 'Храните, смотрите и передавайте 4K-видео и RAW-фото. Оригиналы хранятся без изменений.',
  applicationName: 'AIN Cloud',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

// Тема применяется до первой отрисовки, чтобы не было вспышки светлого/тёмного фона
const themeScript = `try{if(localStorage.getItem('ain-theme')==='LIGHT')document.documentElement.classList.add('light')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Живой фон под матовым стеклом: тлеющие пятна фирменных цветов и зерно */}
        <div className="app-backdrop" aria-hidden>
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
        </div>
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[70] rounded-lg bg-accent-solid px-3 py-2 text-accent-fg">
          К содержимому
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
