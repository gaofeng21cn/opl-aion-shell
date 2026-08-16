import React from 'react';
import { Alert, Button, Input, Message, Modal, Space, Tag, Typography } from '@arco-design/web-react';
import { Copy, Delete, Link, Refresh } from '@icon-park/react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  RemoteCompanionState,
  RemotePairingPublicState,
  RemotePairingState,
} from '@/common/types/remoteCompanion';
import { copyText } from '@/renderer/utils/ui/clipboard';

type RemoteCompanionBridge = typeof ipcBridge.remoteCompanion;

type RemoteAction = 'load' | 'start' | 'poll' | 'confirm' | 'refresh' | 'revoke';

const REMOTE_ERROR_CODES = [
  'invitation_invalid',
  'invitation_expired',
  'invitation_consumed',
  'capacity_unavailable',
  'pairing_expired',
  'pairing_not_ready',
  'provider_unavailable',
  'rate_limited',
] as const;

function remoteCompanionBridge(): RemoteCompanionBridge | undefined {
  return (ipcBridge as unknown as { remoteCompanion?: RemoteCompanionBridge }).remoteCompanion;
}

function errorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return REMOTE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

function pairingStateKey(state: RemotePairingState): string {
  return `settings.resourcesPage.remoteCompanion.states.${state}`;
}

function pairingStateLabel(
  state: RemotePairingState,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  return t(pairingStateKey(state), { defaultValue: state });
}

function expiryLabel(value: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return t('settings.resourcesPage.remoteCompanion.expiryUnknown');
  return t('settings.resourcesPage.remoteCompanion.expires', {
    time: new Date(timestamp).toLocaleString(),
  });
}

const RemoteCompanionSettings: React.FC = () => {
  const { t } = useTranslation();
  const bridge = remoteCompanionBridge();
  const [state, setState] = React.useState<RemoteCompanionState | null>(null);
  const [invitationCode, setInvitationCode] = React.useState('');
  const [desktopLabel, setDesktopLabel] = React.useState(() =>
    t('settings.resourcesPage.remoteCompanion.desktopLabelDefault')
  );
  const [busy, setBusy] = React.useState<RemoteAction | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pairToRevoke, setPairToRevoke] = React.useState<RemotePairingPublicState | null>(null);

  const applyState = React.useCallback((next: RemoteCompanionState) => {
    setState(next);
    setError(null);
  }, []);

  React.useEffect(() => {
    if (!bridge?.getState?.invoke) {
      setBusy(null);
      setError('bridge_unavailable');
      return;
    }
    let active = true;
    const unsubscribe = bridge.stateChanged?.on?.((next) => {
      if (active) applyState(next);
    });
    void bridge.getState.invoke().then(
      (next) => {
        if (active) {
          applyState(next);
          setBusy(null);
        }
      },
      () => {
        if (active) {
          setBusy(null);
          setError('bridge_unavailable');
        }
      }
    );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applyState, bridge]);

  const runAction = React.useCallback(
    async (action: Exclude<RemoteAction, 'load'>, operation: () => Promise<RemoteCompanionState>) => {
      if (!bridge || busy) return;
      setBusy(action);
      setError(null);
      try {
        applyState(await operation());
      } catch (actionError) {
        setError(errorCode(actionError) ?? 'action_failed');
      } finally {
        setBusy(null);
      }
    },
    [applyState, bridge, busy]
  );

  const copyValue = React.useCallback(
    async (value: string) => {
      try {
        await copyText(value);
        Message.success(t('settings.resourcesPage.remoteCompanion.copied'));
      } catch {
        Message.error(t('settings.resourcesPage.remoteCompanion.copyFailed'));
      }
    },
    [t]
  );

  const pending = state?.pairing ?? null;
  const pairs = state?.pairs ?? [];
  const canStartPairing = Boolean(
    state?.configured && !pending && pairs.length < (state?.max_active_pairs ?? 0) && !busy
  );

  const unavailableReason = state?.unavailable_reason;
  const unavailableText = unavailableReason
    ? t(`settings.resourcesPage.remoteCompanion.unavailableReasons.${unavailableReason}`)
    : error === 'bridge_unavailable'
      ? t('settings.resourcesPage.remoteCompanion.unavailable')
      : null;

  const startPairing = () => {
    if (!bridge || !canStartPairing || !invitationCode.trim() || !desktopLabel.trim()) return;
    void runAction('start', () =>
      bridge.startPairing.invoke({
        invitation_code: invitationCode.trim(),
        desktop_label: desktopLabel.trim(),
      })
    );
  };

  const pollPairing = () => {
    if (!bridge || !pending) return;
    void runAction('poll', () => bridge.pollPairing.invoke({ pair_id: pending.pair_id }));
  };

  const confirmPairing = () => {
    if (!bridge || !pending?.authentication_string) return;
    void runAction('confirm', () =>
      bridge.confirmPairing.invoke({
        pair_id: pending.pair_id,
        authentication_string: pending.authentication_string,
      })
    );
  };

  const refreshPair = (pair: RemotePairingPublicState) => {
    if (!bridge) return;
    void runAction('refresh', () => bridge.refreshPair.invoke({ pair_id: pair.pair_id }));
  };

  const revokePair = () => {
    if (!bridge || !pairToRevoke) return;
    const pair = pairToRevoke;
    setPairToRevoke(null);
    void runAction('revoke', () => bridge.revokePairing.invoke({ pair_id: pair.pair_id }));
  };

  return (
    <section className='opl-settings-section' id='opl-link' data-testid='settings-resources-remote-companion'>
      <div className='opl-settings-section__header'>
        <div className='flex min-w-0 items-start gap-10px'>
          <Link className='mt-2px shrink-0 text-t-secondary' theme='outline' size='16' fill='currentColor' />
          <div className='min-w-0'>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.resourcesPage.remoteCompanion.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.resourcesPage.remoteCompanion.description')}
            </Typography.Text>
          </div>
        </div>
        {state && (
          <Tag color={state.configured ? 'arcoblue' : 'orange'}>
            {t('settings.resourcesPage.remoteCompanion.provider')}
          </Tag>
        )}
      </div>

      {!state && !error && (
        <Typography.Text className='text-12px text-t-secondary'>
          {t('settings.resourcesPage.remoteCompanion.loading')}
        </Typography.Text>
      )}

      {unavailableText && (
        <Alert
          type='warning'
          title={t('settings.resourcesPage.remoteCompanion.unavailable')}
          content={unavailableText}
          data-testid='settings-resources-remote-companion-unavailable'
        />
      )}

      {error && error !== 'bridge_unavailable' && (
        <Typography.Text className='block text-12px text-danger' role='alert' data-testid='remote-companion-error'>
          {t(`settings.resourcesPage.remoteCompanion.errors.${error}`, {
            defaultValue: t('settings.resourcesPage.remoteCompanion.errors.action_failed'),
          })}
        </Typography.Text>
      )}

      {pending && (
        <div className='opl-settings-flat-subgroup' data-testid='remote-companion-pairing'>
          <div className='flex flex-wrap items-center justify-between gap-8px'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.resourcesPage.remoteCompanion.pairing.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {pairingStateLabel(pending.state, t)} · {expiryLabel(pending.expires_at, t)}
              </Typography.Text>
            </div>
            <Button
              size='small'
              icon={<Refresh theme='outline' size='16' fill='currentColor' />}
              loading={busy === 'poll'}
              disabled={busy !== null}
              onClick={pollPairing}
              data-testid='remote-companion-poll'
            >
              {t('settings.resourcesPage.remoteCompanion.pairing.refresh')}
            </Button>
          </div>

          <div className='mt-12px flex flex-wrap items-start gap-16px'>
            {pending.qr_url && (
              <div className='flex flex-col items-center gap-6px' data-testid='remote-companion-qr'>
                <QRCodeSVG
                  value={pending.qr_url}
                  size={192}
                  level='M'
                  includeMargin
                  aria-label={t('settings.resourcesPage.remoteCompanion.pairing.qrAlt')}
                />
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.resourcesPage.remoteCompanion.pairing.qr')}
                </Typography.Text>
                <Button
                  size='mini'
                  type='text'
                  icon={<Copy theme='outline' size='14' fill='currentColor' />}
                  aria-label={t('settings.resourcesPage.remoteCompanion.pairing.copyQr')}
                  title={t('settings.resourcesPage.remoteCompanion.pairing.copyQr')}
                  onClick={() => void copyValue(pending.qr_url)}
                  data-testid='remote-companion-copy-qr'
                />
              </div>
            )}
            <div className='flex min-w-200px flex-1 flex-col gap-8px'>
              {pending.authentication_string && (
                <div className='flex flex-col gap-6px' data-testid='remote-companion-authentication'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.resourcesPage.remoteCompanion.pairing.authentication')}
                  </Typography.Text>
                  <Typography.Text className='text-20px font-600 tracking-2px text-t-primary'>
                    {pending.authentication_string}
                  </Typography.Text>
                  <Button
                    type='primary'
                    disabled={busy !== null || pending.state !== 'awaiting_desktop_confirmation'}
                    loading={busy === 'confirm'}
                    onClick={confirmPairing}
                    data-testid='remote-companion-confirm'
                  >
                    {t('settings.resourcesPage.remoteCompanion.pairing.confirm')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {state?.configured && !pending && pairs.length < state.max_active_pairs && (
        <div className='opl-settings-flat-subgroup' data-testid='remote-companion-start-pairing'>
          <div className='flex flex-col gap-10px'>
            <label className='flex flex-col gap-6px'>
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.resourcesPage.remoteCompanion.invitationCode')}
              </Typography.Text>
              <Input
                value={invitationCode}
                placeholder={t('settings.resourcesPage.remoteCompanion.invitationCodePlaceholder')}
                onChange={setInvitationCode}
                data-testid='remote-companion-invitation-code'
              />
            </label>
            <label className='flex flex-col gap-6px'>
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.resourcesPage.remoteCompanion.desktopLabel')}
              </Typography.Text>
              <Input
                value={desktopLabel}
                placeholder={t('settings.resourcesPage.remoteCompanion.desktopLabelPlaceholder')}
                onChange={setDesktopLabel}
                data-testid='remote-companion-desktop-label'
              />
            </label>
            <div>
              <Button
                type='primary'
                icon={<Link theme='outline' size='16' fill='currentColor' />}
                disabled={!invitationCode.trim() || !desktopLabel.trim() || busy !== null}
                loading={busy === 'start'}
                onClick={startPairing}
                data-testid='remote-companion-start'
              >
                {t('settings.resourcesPage.remoteCompanion.startPairing')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {state?.configured && !pending && pairs.length >= (state.max_active_pairs ?? 0) && (
        <Alert
          type='warning'
          title={t('settings.resourcesPage.remoteCompanion.capacityTitle')}
          content={t('settings.resourcesPage.remoteCompanion.capacityDescription')}
          data-testid='remote-companion-capacity'
        />
      )}

      {pairs.length > 0 && (
        <div className='opl-settings-flat-subgroup' data-testid='remote-companion-pairs'>
          <div className='mb-6px text-12px font-600 text-t-secondary'>
            {t('settings.resourcesPage.remoteCompanion.pairs.title', {
              count: pairs.length,
              max: state?.max_active_pairs ?? 0,
            })}
          </div>
          <div className='opl-settings-list'>
            {pairs.map((pair) => (
              <RemotePairRow
                key={pair.pair_id}
                pair={pair}
                busy={busy !== null}
                refreshing={busy === 'refresh'}
                revoking={busy === 'revoke'}
                onRefresh={() => refreshPair(pair)}
                onRevoke={() => setPairToRevoke(pair)}
              />
            ))}
          </div>
        </div>
      )}

      <Modal
        visible={pairToRevoke !== null}
        title={t('settings.resourcesPage.remoteCompanion.pairs.revokeTitle')}
        footer={
          <Space>
            <Button onClick={() => setPairToRevoke(null)}>{t('common.cancel')}</Button>
            <Button
              status='danger'
              type='primary'
              loading={busy === 'revoke'}
              disabled={busy !== null}
              onClick={revokePair}
              data-testid='remote-companion-revoke-confirm'
            >
              {t('settings.resourcesPage.remoteCompanion.pairs.confirmRevoke')}
            </Button>
          </Space>
        }
        onCancel={() => setPairToRevoke(null)}
        unmountOnExit
      >
        <Typography.Text className='text-12px text-t-secondary'>
          {t('settings.resourcesPage.remoteCompanion.pairs.revokeDescription')}
        </Typography.Text>
      </Modal>
    </section>
  );
};

const RemotePairRow: React.FC<{
  pair: RemotePairingPublicState;
  busy: boolean;
  refreshing: boolean;
  revoking: boolean;
  onRefresh: () => void;
  onRevoke: () => void;
}> = ({ pair, busy, refreshing, revoking, onRefresh, onRevoke }) => {
  const { t } = useTranslation();
  return (
    <div className='opl-settings-row items-start' data-testid={`remote-companion-pair-${pair.pair_id}`}>
      <div className='opl-settings-row__main min-w-0'>
        <Typography.Text className='block break-words font-600 text-t-primary'>
          {pair.peer_device_label}
        </Typography.Text>
        <Typography.Text className='block break-words text-12px text-t-secondary'>
          {pair.desktop_label} · {pairingStateLabel(pair.state, t)}
        </Typography.Text>
        <div className='mt-4px flex flex-wrap gap-6px'>
          <Tag color={pair.state === 'active' ? 'arcoblue' : 'orange'}>
            {t('settings.resourcesPage.remoteCompanion.provider')}
          </Tag>
          {pair.projection_stale && <Tag color='orange'>{t('settings.resourcesPage.remoteCompanion.pairs.stale')}</Tag>}
        </div>
      </div>
      <div className='opl-settings-row__meta flex flex-wrap items-center gap-6px'>
        <Button
          size='mini'
          type='secondary'
          icon={<Refresh theme='outline' size='14' fill='currentColor' />}
          loading={refreshing}
          disabled={busy || pair.state !== 'active'}
          onClick={onRefresh}
          aria-label={t('settings.resourcesPage.remoteCompanion.pairs.refresh')}
          title={t('settings.resourcesPage.remoteCompanion.pairs.refresh')}
          data-testid={`remote-companion-refresh-${pair.pair_id}`}
        />
        <Button
          size='mini'
          status='danger'
          icon={<Delete theme='outline' size='14' fill='currentColor' />}
          loading={revoking}
          disabled={busy}
          onClick={onRevoke}
          aria-label={t('settings.resourcesPage.remoteCompanion.pairs.revoke')}
          title={t('settings.resourcesPage.remoteCompanion.pairs.revoke')}
          data-testid={`remote-companion-revoke-${pair.pair_id}`}
        />
      </div>
    </div>
  );
};

export default RemoteCompanionSettings;
