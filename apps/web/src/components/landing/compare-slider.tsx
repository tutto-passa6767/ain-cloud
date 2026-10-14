'use client';

import { ChevronsLeftRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { AlmatyScene } from './almaty-scene';

/** Пережимаем тот же кадр так, как это делает мессенджер: маленькое разрешение и два прохода JPEG */
function useMessengerCopy(svg: SVGSVGElement | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', '1600');
    clone.setAttribute('height', '900');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 288;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const first = new Image();
      first.onload = () => {
        ctx.drawImage(first, 0, 0);
        setSrc(c.toDataURL('image/jpeg', 0.1));
      };
      first.src = c.toDataURL('image/jpeg', 0.14);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [svg]);
  return src;
}

/** Шторка «мессенджер ↔ оригинал»: тянется мышью, пальцем и стрелками клавиатуры */
export function CompareSlider() {
  const { t } = useI18n();
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const low = useMessengerCopy(svg);
  const [pos, setPos] = useState(50);
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // Один раз показываем, что шторка двигается, когда блок появился на экране
  useEffect(() => {
    const node = box.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const keys = [50, 24, 76, 50];
        const start = performance.now();
        const step = (now: number) => {
          if (touched.current) return;
          const p = Math.min(1, (now - start) / 2400) * (keys.length - 1);
          const i = Math.min(keys.length - 2, Math.floor(p));
          const k = p - i;
          const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          setPos(keys[i] + (keys[i + 1] - keys[i]) * ease);
          if (p < keys.length - 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={box} className="group relative aspect-video select-none overflow-hidden rounded-3xl border border-border bg-black shadow-pop">
      <AlmatyScene ref={setSvg} className="absolute inset-0 size-full" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {low ? (
          // eslint-disable-next-line @next/next/no-img-element -- картинка собирается в браузере из data: URL
          <img src={low} alt="" className="size-full object-cover" />
        ) : (
          <AlmatyScene className="size-full blur-[3px]" />
        )}
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 font-mono text-[11px] text-white/85 backdrop-blur sm:left-4 sm:top-4">
        {t('landing.compareLeft')}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 font-mono text-[11px] text-white backdrop-blur sm:right-4 sm:top-4">
        <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[#ff4d5e] align-middle" />
        {t('landing.compareRight')}
      </span>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-white/85 shadow-[0_0_14px_rgba(255,255,255,0.6)]" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-transform group-has-[input:focus-visible]:ring-4 group-has-[input:focus-visible]:ring-[rgba(255,77,94,0.6)] group-active:scale-95">
          <ChevronsLeftRight className="size-5" />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={pos}
        aria-label={t('landing.compareSlider')}
        onChange={(e) => {
          touched.current = true;
          setPos(Number(e.target.value));
        }}
        onPointerDown={() => (touched.current = true)}
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
