'use client';

import clsx from 'clsx';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CloudPose } from '@/components/mascot/cloud-model';
import { MascotStage } from '@/components/mascot/mascot-stage';
import { PublicPage } from '@/components/public';
import { useI18n } from '@/i18n';

const POSES: CloudPose[] = ['hello', 'idle', 'think', 'happy', 'angry', 'confused', 'sleep'];
const FILE = 'Свадьба_4K.mov';

/** Просмотр семи состояний и сценария загрузки — как прототип из ТЗ маскота, но на настоящем модуле */
export function MascotPreview() {
  const { t, list } = useI18n();
  const names = list('mascot.stateNames');
  const [pose, setPose] = useState<CloudPose>('hello');
  const [text, setText] = useState(() => t('mascot.tour1'));
  const [urgent, setUrgent] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => stop, []);

  const sample = (p: CloudPose) =>
    ({
      hello: t('mascot.tour1'),
      idle: t('mascot.idle'),
      think: t('mascot.uploading', { name: FILE, percent: 38 }),
      happy: t('mascot.uploaded', { name: FILE }),
      angry: t('mascot.offline'),
      confused: t('mascot.notFound'),
      sleep: t('mascot.sleep'),
    })[p];

  const show = (p: CloudPose, line = sample(p)) => {
    setPose(p);
    setText(line);
    setUrgent(p === 'angry');
  };

  // Думает → (обрыв) Злой → (связь вернулась) Думает → Радость → Ожидание (ТЗ маскота §8.1)
  const scenario = () => {
    stop();
    const steps: [number, () => void][] = [
      [0, () => show('think', t('mascot.uploading', { name: FILE, percent: 38 }))],
      [1500, () => show('think', t('mascot.uploading', { name: FILE, percent: 64 }))],
      [3200, () => show('angry')],
      [7000, () => show('think', t('mascot.resumed', { percent: 64 }))],
      [9000, () => show('think', t('mascot.resumed', { percent: 97 }))],
      [10500, () => show('happy')],
      [14500, () => show('idle')],
    ];
    timers.current = steps.map(([ms, fn]) => setTimeout(fn, ms));
  };

  return (
    <PublicPage>
      <section className="mx-auto flex max-w-4xl flex-col items-center px-4 py-12 text-center">
        <h1 className="display text-4xl sm:text-5xl">{t('mascot.preview')}</h1>
        <p className="mt-4 max-w-xl text-muted">{t('mascot.previewText')}</p>
        <p
          role={urgent ? 'alert' : 'status'}
          className={clsx('animate-pop mt-10 max-w-md rounded-2xl glass-strong px-4 py-3 text-sm', urgent && 'border-warning/50')}
          key={text}
        >
          {text}
        </p>
        <MascotStage pose={pose} size={[520, 402]} narrowSize={[340, 263]} label={t('mascot.name')} />
        <div className="mt-6 flex flex-wrap justify-center gap-2" role="group" aria-label={t('mascot.preview')}>
          {POSES.map((p, i) => (
            <button
              key={p}
              type="button"
              aria-pressed={pose === p}
              onClick={() => {
                stop();
                show(p);
              }}
              className={clsx('rounded-full border px-4 py-2 text-sm transition-colors', pose === p ? 'border-accent bg-accent-soft text-fg' : 'border-border text-muted hover:bg-surface-2 hover:text-fg')}
            >
              {names[i]}
            </button>
          ))}
        </div>
        <button type="button" onClick={scenario} className="btn-primary mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium">
          <Play className="size-4" />
          {t('mascot.scenario')}
        </button>
      </section>
    </PublicPage>
  );
}
