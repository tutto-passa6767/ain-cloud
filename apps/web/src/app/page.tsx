'use client';

import {
  Check,
  CloudUpload,
  Film,
  FolderTree,
  Image as ImageIcon,
  Link2,
  Lock,
  PlayCircle,
  Search,
  ShieldCheck,
  Building2,
  Camera,
  Clapperboard,
  Megaphone,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { VideoPlayer } from '@/components/file/video-player';
import { BarysIcon } from '@/components/mascot/barys-icon';
import { PricingGrid } from '@/components/pricing-grid';
import { HeroMascot, PublicFooter, PublicHeader } from '@/components/public';
import { useSession } from '@/components/providers';
import { useI18n } from '@/i18n';
import type { AssetDetail } from '@/lib/types';

const split = (s: string) => {
  const i = s.indexOf('|');
  return [s.slice(0, i), s.slice(i + 1)] as const;
};

function SectionTitle({ title, text, id }: { title: string; text?: string; id?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {text && <p className="mt-3 text-muted">{text}</p>}
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

  const features = [
    { icon: ShieldCheck, title: t('landing.f1Title'), text: t('landing.f1') },
    { icon: CloudUpload, title: t('landing.f2Title'), text: t('landing.f2') },
    { icon: Film, title: t('landing.f3Title'), text: t('landing.f3') },
    { icon: Lock, title: t('landing.f4Title'), text: t('landing.f4') },
    { icon: ImageIcon, title: t('landing.f5Title'), text: t('landing.f5') },
    { icon: Link2, title: t('landing.f6Title'), text: t('landing.f6') },
    { icon: Search, title: t('landing.f7Title'), text: t('landing.f7') },
    { icon: Lock, title: t('landing.f8Title'), text: t('landing.f8') },
  ];
  const audienceIcons = [Video, Camera, Clapperboard, Building2, Megaphone];
  const faq = (['1', '2', '3', '4', '5', '6', '7'] as const).map((n) => [t(`landing.q${n}`), t(`landing.a${n}`)]);

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
        {/* Первый экран: Барыс на подставке машет лапой (ТЗ §13.2, «Привет») */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-40 top-60 size-[420px] rounded-full bg-success/5 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-12 md:grid-cols-[1.15fr_1fr] md:pt-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-success" />
                {t('landing.badge')}
              </span>
              <h1 className="text-gradient mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">{t('landing.title')}</h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{t('landing.subtitle')}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={startHref} className="rounded-xl bg-accent px-5 py-3 font-medium text-accent-fg transition-colors hover:bg-accent-strong">
                  {user ? t('nav.drive') : t('landing.cta')}
                </Link>
                <a href="#demo" className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 font-medium transition-colors hover:bg-surface-2">
                  <PlayCircle className="size-5" />
                  {t('landing.ctaSecondary')}
                </a>
              </div>
              {!user && <p className="mt-3 text-sm text-subtle">{t('landing.ctaHint')}</p>}
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {[t('landing.trust1'), t('landing.trust2'), t('landing.trust3')].map((x) => (
                  <li key={x} className="flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col items-center">
              <HeroMascot />
              <p className="-mt-2 text-sm text-muted">{t('landing.mascotCaption')}</p>
            </div>
          </div>
        </section>

        {/* Ключевые параметры сервиса — характеристики продукта, а не придуманная статистика */}
        <section className="border-y border-border bg-bg-elevated">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
            {list('landing.facts').map((f) => {
              const [value, label] = split(f);
              return (
                <div key={value}>
                  <dt className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</dt>
                  <dd className="mt-1 text-sm text-muted">{label}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        {/* Демо 4K-плеера (ТЗ §5) */}
        <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <SectionTitle title={t('landing.demoTitle')} text={t('landing.demoText')} />
              <ul className="-mt-2 flex flex-col gap-3 text-sm">
                {list('landing.demoPoints').map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {demo ? (
                <>
                  <VideoPlayer asset={demo.asset} src={`/api/public/s/${demo.token}/assets/${demo.asset.id}/hls/master.m3u8`} globalHotkeys={false} />
                  <p className="mt-3 text-xs text-subtle">{t('landing.demoNote')}</p>
                </>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-border bg-gradient-to-br from-surface to-surface-2 text-muted">
                  <PlayCircle className="size-12 text-accent" />
                  <p className="text-sm">{t('landing.demoPreview')}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Как это работает — основной сценарий ТЗ §1 */}
        <section className="border-t border-border bg-bg-elevated">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle title={t('landing.howTitle')} />
            <ol className="grid gap-4 md:grid-cols-3">
              {list('landing.how').map((s, i) => {
                const [title, text] = split(s);
                return (
                  <li key={title} className="glass spotlight rounded-2xl p-6">
                    <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">{i + 1}</span>
                    <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm text-muted">{text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <SectionTitle title={t('landing.featuresTitle')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="glass spotlight rounded-2xl p-5">
                <Icon className="size-6 text-accent" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-bg-elevated">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle title={t('landing.audienceTitle')} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {list('landing.audience').map((a, i) => {
                const [title, text] = split(a);
                const Icon = audienceIcons[i] ?? FolderTree;
                return (
                  <div key={title} className="glass spotlight rounded-2xl p-5">
                    <Icon className="size-5 text-accent" />
                    <h3 className="mt-3 font-semibold">{title}</h3>
                    <p className="mt-2 text-sm text-muted">{text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <SectionTitle title={t('landing.formatsTitle')} />
            <dl className="divide-y divide-border overflow-hidden rounded-2xl glass">
              {list('landing.formats').map((f) => {
                const [kind, items] = split(f);
                return (
                  <div key={kind} className="grid grid-cols-[110px_1fr] gap-4 px-5 py-3 text-sm">
                    <dt className="font-medium">{kind}</dt>
                    <dd className="text-muted">{items}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-xs text-subtle">{t('landing.formatsNote')}</p>
          </div>
          <div>
            <SectionTitle title={t('landing.securityTitle')} />
            <ul className="flex flex-col gap-3">
              {list('landing.security').map((s) => (
                <li key={s} className="flex gap-3 rounded-2xl glass p-4 text-sm">
                  <ShieldCheck className="size-5 shrink-0 text-success" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-t border-border bg-bg-elevated">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle title={t('landing.pricingTitle')} text={t('landing.pricingText')} />
            <PricingGrid />
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
          <SectionTitle title={t('landing.faq')} />
          <div className="divide-y divide-border rounded-2xl glass">
            {faq.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
                  {q}
                  <span className="text-xl text-accent transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-2 px-6 py-12 text-center md:flex-row md:text-left">
            <BarysIcon size={96} mood="happy" className="shrink-0" />
            <div className="flex-1">
              <h2 className="text-2xl font-semibold sm:text-3xl">{t('landing.finalTitle')}</h2>
              <p className="mt-2 text-muted">{t('landing.finalText')}</p>
            </div>
            <Link href={startHref} className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-fg transition-colors hover:bg-accent-strong">
              {user ? t('nav.drive') : t('landing.cta')}
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
