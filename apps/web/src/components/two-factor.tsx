'use client';

import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useErrorText } from './drive/actions';
import { useSession } from './providers';
import { useToast } from './toast';
import { Badge, Button, Input } from './ui';

/** Включение 2FA (TOTP): QR-код или ключ вручную, подтверждение кодом из приложения */
export function TwoFactorPanel({ onEnabled }: { onEnabled?: () => void }) {
  const { t } = useI18n();
  const { user, refresh } = useSession();
  const toast = useToast();
  const errText = useErrorText();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = !!user?.totpEnabledAt;
  const staff = user?.role !== 'USER';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-accent" />
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? t('twofa.enabled') : t('twofa.disabled')}</Badge>
      </div>
      {!enabled && !setup && (
        <Button className="self-start" loading={busy} onClick={() => run(async () => setSetup(await api('/auth/2fa/setup', { method: 'POST' })))}>
          {t('twofa.enable')}
        </Button>
      )}
      {!enabled && setup && (
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* QR-код сгенерирован сервером как SVG из адреса otpauth:// */}
          <div className="size-[200px] shrink-0 overflow-hidden rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} aria-label="QR" />
          <form
            className="flex flex-1 flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/auth/2fa/enable', { method: 'POST', body: { code } });
                await refresh();
                setSetup(null);
                setCode('');
                toast(t('twofa.done'), 'success');
                onEnabled?.();
              });
            }}
          >
            <p className="text-sm text-muted">{t('twofa.scan')}</p>
            <div>
              <p className="text-xs text-muted">{t('twofa.key')}</p>
              <code className="mt-1 block break-all rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-sm">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            </div>
            <Input label={t('twofa.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} />
            <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="self-start">
              {t('twofa.confirm')}
            </Button>
          </form>
        </div>
      )}
      {enabled && !staff && (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/auth/2fa/disable', { method: 'POST', body: { code } });
              await refresh();
              setCode('');
              toast(t('twofa.off'), 'success');
            });
          }}
        >
          <div className="flex-1">
            <Input label={t('twofa.code')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} />
          </div>
          <Button type="submit" variant="danger" loading={busy} disabled={code.length !== 6} className="sm:mb-0">
            {t('twofa.disable')}
          </Button>
        </form>
      )}
      {enabled && staff && <p className="text-xs text-muted">{t('twofa.mandatory')}</p>}
      {error && !setup && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
