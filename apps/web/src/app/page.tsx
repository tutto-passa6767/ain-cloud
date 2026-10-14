'use client';

import { Image as ImageIcon, PlayCircle, Search, ShieldCheck, type LucideIcon } from 'lucide-react';
import useSWR from 'swr';
import { VideoPlayer } from '@/components/file/video-player';
import { CompareSlider } from '@/components/landing/compare-slider';
import { ShareDemo } from '@/components/landing/share-demo';
import { UploadDemo } from '@/components/landing/upload-demo';
import { FocusBox, Viewfinder } from '@/components/landing/viewfinder';
import { CloudIcon } from '@/components/mascot/cloud-icon';
import { MascotStage } from '@/components/mascot/mascot-stage';
import { PricingGrid } from '@/components/pricing-grid';
import { CtaLink, PublicFooter, PublicHeader, RichTitle } from '@/components/public';
import { useSession } from '@/components/providers';
import { useI18n } from '@/i18n';
import type { AssetDetail } from '@/lib/types';

/** Форматы для бегущей строки — вместо логотипов партнёров: то, что сервис действительно понимает */
const FORMATS = ['MP4', 'MOV', 'ProRes', 'HEVC', 'AV1', 'MKV', 'DNG', 'CR3', 'NEF', 'ARW', 'HEIC', 'TIFF', 'FLAC', 'PDF'];

function Eyebrow({ index, children }: { index: string; children: string }) {
  return (
    <span className="eyebrow">
      <span className="text-accent">{index}</span>
      {children}
    </span>
  );
}

/** Шапка раздела: метка с номером «как у сцены», крупный заголовок и пояснение справа */
function SectionHead({ index, eyebrow, title, text, id }: { index: string; eyebrow: string; title: string; text?: string; id?: string }) {
  return (
    <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <RichTitle id={id} text={title} className="mt-5 text-4xl sm:text-5xl" />
      </div>
      {text && <p className="max-w-sm text-sm text-muted md:text-right">{text}</p>}
    </div>
  );
}

function SmallCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="card-noir spotlight rounded-3xl p-6">
      <span className="flex size-10 items-center justify-center rounded-2xl border border-border bg-accent-soft text-accent">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

/** Главная (ТЗ §5): преимущества, демо 4K-плеера, тарифы, вопросы, регистрация */
export default function LandingPage() {
  const { t, list } = useI18n();
  const { user } = useSession();
  const { data: landing } = useSWR<{ demo: { token: string; asset: AssetDetail } | null }>('/public/landing', { revalidateOnFocus: false });
  const demo = landing?.demo;
  const startHref = user ? '/drive' : '/signup';
  const startLabel = user ? t('nav.drive') : t('landing.cta');
  const faq = (['3', '5', '6'] as const).map((n) => [t(`landing.q${n}`), t(`landing.a${n}`)]);

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader
        anchors={[
          { href: '#features', label: t('landing.navFeatures') },
          { href: '#demo', label: t('landing.navDemo') },
          { href: '#pricing', label: t('landing.navPricing') },
          { href: '#faq', label: t('landing.navFaq') },
        ]}
      />
      <main id="main" className="flex-1">
        {/* Первый экран — монитор камеры; Облачко в состоянии «Привет» (ТЗ маскота §3) и «в фокусе» */}
        <section className="px-3 pt-4 sm:px-4">
          <div className="mx-auto max-w-7xl">
            <Viewfinder>
              <div className="grid items-center gap-2 px-6 pb-14 pt-20 sm:px-10 md:grid-cols-[1.25fr_1fr] md:px-14 md:pb-20 md:pt-24">
                <div className="animate-fade-up">
                  <span className="eyebrow">{t('landing.badge')}</span>
                  <RichTitle as="h1" text={t('landing.title')} className="mt-6 text-[2.6rem] sm:text-6xl lg:text-[4.75rem]" />
                  <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">{t('landing.subtitle')}</p>
                  <div className="mt-9 flex flex-wrap items-center gap-3">
                    <CtaLink href={startHref}>{startLabel}</CtaLink>
                    <a href="#demo" className="inline-flex h-12 items-center gap-2 rounded-full border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-surface-2">
                      <PlayCircle className="size-5 text-accent" />
                      {t('landing.ctaSecondary')}
                    </a>
                  </div>
                  {!user && <p className="mt-3 text-sm text-subtle">{t('landing.ctaHint')}</p>}
                </div>
                <div className="relative flex justify-center">
                  <div className="ember-glow pointer-events-none absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 opacity-70 sm:size-[380px]" aria-hidden />
                  <MascotStage pose="hello" size={[460, 356]} narrowSize={[320, 248]} label={t('mascot.name')} />
                  <FocusBox label={t('landing.afLabel')} className="left-1/2 top-[52%] h-[150px] w-[230px] sm:h-[200px] sm:w-[320px]" />
                </div>
              </div>
            </Viewfinder>

            {/* Бегущая строка форматов */}
            <div className="flex items-center gap-8 px-2 pb-6 pt-7">
              <p className="hidden max-w-[11rem] shrink-0 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-subtle md:block">{t('landing.formatsStrip')}</p>
              <div className="marquee min-w-0 flex-1 overflow-hidden" aria-label={t('landing.formatsStrip')}>
                <ul className="marquee-track">
                  {[...FORMATS, ...FORMATS].map((f, i) => (
                    <li key={i} aria-hidden={i >= FORMATS.length || undefined} className="px-6 text-lg font-semibold tracking-[0.18em] text-subtle">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 01 — оригинал против мессенджера */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
          <SectionHead index="01" eyebrow={t('landing.compareEyebrow')} title={t('landing.compareTitle')} text={t('landing.compareText')} />
          <CompareSlider />
        </section>

        {/* 02 — демо 4K-плеера (ТЗ §5) */}
        <section id="demo" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <Eyebrow index="02">{t('landing.navDemo')}</Eyebrow>
              <RichTitle text={t('landing.demoTitle')} className="mt-5 text-4xl sm:text-5xl" />
              <p className="mt-5 text-muted">{t('landing.demoText')}</p>
              <ul className="mt-6 flex flex-col gap-2.5 font-mono text-xs text-muted">
                {list('landing.demoPoints').map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="text-accent">▸</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="ember-glow pointer-events-none absolute inset-x-10 -bottom-10 top-10 opacity-50" aria-hidden />
              <div className="glow-ring relative rounded-3xl glass-strong p-2">
                {demo ? (
                  <VideoPlayer asset={demo.asset} src={`/api/public/s/${demo.token}/assets/${demo.asset.id}/hls/master.m3u8`} globalHotkeys={false} />
                ) : (
                  <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-[radial-gradient(80%_80%_at_50%_100%,rgba(230,30,50,0.25),transparent)] text-muted">
                    <PlayCircle className="size-14 text-accent" strokeWidth={1.25} />
                    <p className="text-sm">{t('landing.demoPreview')}</p>
                  </div>
                )}
              </div>
              {demo && <p className="mt-3 text-xs text-subtle">{t('landing.demoNote')}</p>}
            </div>
          </div>
        </section>

        {/* 03 — загрузка частями с обрывом связи */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <Eyebrow index="03">{t('landing.uploadEyebrow')}</Eyebrow>
              <RichTitle text={t('landing.uploadTitle')} className="mt-5 text-4xl sm:text-5xl" />
              <p className="mt-5 text-muted">{t('landing.uploadText')}</p>
            </div>
            <UploadDemo />
          </div>
        </section>

        {/* 04 — ссылка для клиента */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <ShareDemo
            intro={
              <>
                <Eyebrow index="04">{t('landing.shareEyebrow')}</Eyebrow>
                <RichTitle text={t('landing.shareTitle')} className="mt-5 text-4xl sm:text-5xl" />
                <p className="mt-5 text-muted">{t('landing.shareText')}</p>
              </>
            }
          />
        </section>

        {/* 05 — остальное коротко */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <SectionHead index="05" eyebrow={t('landing.moreEyebrow')} title={t('landing.moreTitle')} />
          <div className="grid gap-4 md:grid-cols-3">
            <SmallCard icon={ImageIcon} title={t('landing.f5Title')} text={t('landing.f5')} />
            <SmallCard icon={Search} title={t('landing.f7Title')} text={t('landing.f7')} />
            <SmallCard icon={ShieldCheck} title={t('landing.f8Title')} text={t('landing.f8')} />
          </div>
        </section>

        <section id="pricing" className="relative scroll-mt-24">
          <div className="ember-glow pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[70%] -translate-x-1/2 opacity-25" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 py-20">
            <SectionHead index="06" eyebrow={t('landing.navPricing')} title={t('landing.pricingTitle')} text={t('landing.pricingText')} />
            <PricingGrid />
          </div>
        </section>

        <section id="faq" className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-4 py-20 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <Eyebrow index="07">{t('landing.navFaq')}</Eyebrow>
            <RichTitle text={t('landing.faq')} className="mt-5 text-4xl sm:text-5xl" />
          </div>
          <div className="flex flex-col gap-3">
            {faq.map(([q, a]) => (
              <details key={q} className="card-noir group rounded-2xl px-5 py-4 open:border-border-strong">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
                  {q}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-accent transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Финальный призыв под светящимся горизонтом */}
        <section className="relative overflow-hidden px-4 pb-28 pt-36">
          <div className="horizon top-16" aria-hidden />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <CloudIcon size={96} mood="happy" />
            <RichTitle text={t('landing.finalTitle')} className="mt-6 text-4xl sm:text-6xl" />
            <p className="mt-5 max-w-lg text-muted">{t('landing.finalText')}</p>
            <CtaLink href={startHref} className="mt-9">
              {startLabel}
            </CtaLink>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
