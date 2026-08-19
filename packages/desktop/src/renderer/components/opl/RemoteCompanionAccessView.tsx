/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  prepareOplRemoteCompanionAccessActionInput,
  readOplRemoteCompanionAccessResult,
  type OplRemoteCompanionAccessAction,
  type OplRemoteCompanionAccessResult,
} from '@/common/types/opl/remoteCompanionAccess';
import {
  readOplPackageContributionReadResult,
  resolveOplUiContributionLabel,
  type OplUiContribution,
  type OplUiContributionCommand,
} from '@/common/types/opl/uiContributions';
import { Alert, Button, Input, Message, Modal, Spin, Tag, Typography } from '@arco-design/web-react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OplIcon } from './OplVisualProvider';

type RemoteCompanionAccessViewProps = {
  entry: OplUiContribution;
  locale: string;
  actionAvailable: boolean;
  runningCommandKey: string | null;
  executeCommand: (
    entry: OplUiContribution,
    command: OplUiContributionCommand,
    confirmed: boolean,
    input: Record<string, unknown>
  ) => Promise<boolean>;
};

const SECRET_INPUT_KEYS = new Set([
  'invitation_code',
  'manual_code',
  'qr_payload',
  'authentication_digits',
  'claim_secret',
  'claim_material',
  'device_credential',
  'provider_credential',
]);

function invocationKey(entry: OplUiContribution, commandId: string, input: Record<string, unknown>): string {
  const safeInput = Object.fromEntries(Object.entries(input).filter(([key]) => !SECRET_INPUT_KEYS.has(key)));
  return `${entry.contributionKey}:${commandId}:${JSON.stringify(safeInput)}`;
}

function actionLabel(
  action: OplRemoteCompanionAccessAction,
  command: OplUiContributionCommand,
  locale: string
): string {
  return resolveOplUiContributionLabel(command.label, locale, action.commandId);
}

function formatManualCode(value: string): string {
  return value.replace(/(.{4})(.{4})(.{4})/u, '$1 $2 $3');
}

function formatAuthenticationDigits(value: string): string {
  return value.length === 6 ? `${value.slice(0, 3)} ${value.slice(3)}` : value;
}

const stateTagColors: Partial<Record<OplRemoteCompanionAccessResult['status'], 'green' | 'orange' | 'red'>> = {
  active: 'green',
  attention: 'orange',
  revoking: 'orange',
  unavailable: 'red',
};

const RemoteCompanionAccessView: React.FC<RemoteCompanionAccessViewProps> = ({
  entry,
  locale,
  actionAvailable,
  runningCommandKey,
  executeCommand,
}) => {
  const { t } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const [result, setResult] = useState<OplRemoteCompanionAccessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const [pairDisplayName, setPairDisplayName] = useState('');
  const [authenticationDigits, setAuthenticationDigits] = useState('');
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const view = entry.view;

  const load = useCallback(async () => {
    if (!view) return;
    setLoading(true);
    setLoadError(false);
    try {
      const commandResult = await ipcBridge.oplRuntime.runPackageContribution.invoke({
        packageId: entry.packageId,
        ref: view.dataRef,
        operation: 'read',
        input: {},
      });
      const readResult = readOplPackageContributionReadResult(commandResult, {
        packageId: entry.packageId,
        ref: view.dataRef,
      });
      const remoteResult = readOplRemoteCompanionAccessResult(readResult);
      if (!remoteResult) throw new Error('invalid remote companion access response');
      setResult(remoteResult);
      if (remoteResult.pairing?.authenticationDigits && authenticationDigits.length !== 6) {
        setAuthenticationDigits(remoteResult.pairing.authenticationDigits);
      }
      if (remoteResult.devices) {
        setDeviceNames((current) =>
          Object.fromEntries(
            remoteResult.devices!.map((device) => [device.deviceId, current[device.deviceId] ?? device.displayName])
          )
        );
      }
    } catch {
      setResult(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [authenticationDigits.length, entry.packageId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!result?.refreshAfterMs) return;
    const timer = window.setTimeout((): void => {
      void load();
    }, result.refreshAfterMs);
    return () => window.clearTimeout(timer);
  }, [load, result]);

  const pairStartAction = useMemo(() => result?.actions.find((action) => action.commandId === 'pair.start'), [result]);

  const prepareInput = useCallback(
    (action: OplRemoteCompanionAccessAction): Record<string, unknown> | null => {
      if (action.commandId === 'pair.start') {
        return prepareOplRemoteCompanionAccessActionInput(action, {
          invitationCode,
          displayName: pairDisplayName,
        });
      }
      if (action.commandId === 'pair.confirm') {
        return prepareOplRemoteCompanionAccessActionInput(action, { authenticationDigits });
      }
      if (action.commandId === 'device.rename') {
        return prepareOplRemoteCompanionAccessActionInput(action, {
          displayName: deviceNames[action.input.device_id] ?? '',
        });
      }
      return prepareOplRemoteCompanionAccessActionInput(action);
    },
    [authenticationDigits, deviceNames, invitationCode, pairDisplayName]
  );

  const requestAction = useCallback(
    (action: OplRemoteCompanionAccessAction) => {
      const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
      if (!command || !actionAvailable || !result) return;
      const input = prepareInput(action);
      if (!input) {
        message.error(t('common.oplUiContributions.remoteCompanionAccess.invalidInput'));
        return;
      }
      const run = async () => {
        if (await executeCommand(entry, command, command.confirmationRequired, input)) await load();
      };
      if (!command.confirmationRequired) {
        void run();
        return;
      }
      Modal.confirm({
        title: t('common.oplUiContributions.confirmTitle', {
          command: actionLabel(action, command, locale),
        }),
        content: t('common.oplUiContributions.confirmDescription', { package: entry.packageId }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: run,
      });
    },
    [actionAvailable, entry, executeCommand, load, locale, message, prepareInput, result, t]
  );

  if (loading && !result) {
    return (
      <div className='flex min-h-72px items-center justify-center' data-testid='opl-remote-companion-access-loading'>
        <Spin />
      </div>
    );
  }
  if (loadError || !result) {
    return (
      <Alert
        type='warning'
        showIcon
        content={t('common.oplUiContributions.remoteCompanionAccess.readFailed')}
        data-testid='opl-remote-companion-access-read-failed'
      />
    );
  }

  if (result.status === 'unavailable') {
    const refreshAction = result.actions.find((action) => action.commandId === 'pair.refresh');
    const refreshCommand = refreshAction
      ? entry.commands.find((command) => command.commandId === refreshAction.commandId)
      : undefined;
    const refreshKey =
      refreshAction && refreshCommand ? invocationKey(entry, refreshCommand.commandId, refreshAction.input) : null;
    return (
      <>
        {messageContextHolder}
        <Alert
          type='info'
          showIcon
          content={
            <div className='flex flex-wrap items-center gap-8px'>
              <span>{t('common.oplUiContributions.remoteCompanionAccess.unavailable')}</span>
              {refreshAction && refreshCommand && (
                <Button
                  size='small'
                  type='text'
                  icon={<OplIcon name='refreshSmall' />}
                  disabled={!actionAvailable}
                  loading={runningCommandKey === refreshKey}
                  onClick={() => requestAction(refreshAction)}
                >
                  {actionLabel(refreshAction, refreshCommand, locale)}
                </Button>
              )}
            </div>
          }
          data-testid='opl-remote-companion-access-unavailable'
        />
      </>
    );
  }

  const actionButtons = result.actions.flatMap((action) => {
    const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
    if (!command) return [];
    const input = prepareInput(action) ?? action.input;
    const key = invocationKey(entry, command.commandId, input);
    const isRename = action.commandId === 'device.rename';
    const isRevoke = action.commandId === 'pair.revoke';
    const isConfirm = action.commandId === 'pair.confirm';
    const isStart = action.commandId === 'pair.start';
    return [
      <Button
        key={action.commandId}
        size='small'
        type={isRevoke ? 'outline' : 'text'}
        status={isRevoke ? 'danger' : undefined}
        icon={<OplIcon name={isRevoke ? 'trash' : isConfirm ? 'check' : isStart ? 'link' : 'refreshSmall'} />}
        disabled={
          !actionAvailable ||
          !prepareInput(action) ||
          (isRename && !(deviceNames[action.input.device_id] ?? '').trim()) ||
          (isConfirm && !/^\d{6}$/u.test(authenticationDigits))
        }
        loading={runningCommandKey === key}
        onClick={() => requestAction(action)}
      >
        {actionLabel(action, command, locale)}
      </Button>,
    ];
  });

  return (
    <div className='flex min-w-0 flex-col gap-12px' data-testid='opl-remote-companion-access'>
      {messageContextHolder}
      <div className='flex min-w-0 flex-wrap items-center gap-8px'>
        <Tag color={stateTagColors[result.status]}>
          {t(`common.oplUiContributions.remoteCompanionAccess.states.${result.status}`)}
        </Tag>
        <div className='ml-auto flex flex-wrap items-center gap-6px'>{actionButtons}</div>
      </div>

      {pairStartAction && (
        <div className='flex min-w-0 flex-wrap items-end gap-8px' data-testid='opl-remote-companion-access-start'>
          <label className='flex min-w-180px flex-1 flex-col gap-4px'>
            <Typography.Text type='secondary'>
              {t('common.oplUiContributions.remoteCompanionAccess.invitationCode')}
            </Typography.Text>
            <Input
              value={invitationCode}
              onChange={setInvitationCode}
              placeholder={t('common.oplUiContributions.remoteCompanionAccess.invitationCodePlaceholder')}
              maxLength={512}
              autoComplete='off'
            />
          </label>
          <label className='flex min-w-180px flex-1 flex-col gap-4px'>
            <Typography.Text type='secondary'>
              {t('common.oplUiContributions.remoteCompanionAccess.deviceName')}
            </Typography.Text>
            <Input
              value={pairDisplayName}
              onChange={setPairDisplayName}
              placeholder={t('common.oplUiContributions.remoteCompanionAccess.deviceNamePlaceholder')}
              maxLength={256}
              autoComplete='off'
            />
          </label>
        </div>
      )}

      {result.status === 'qr_ready' && result.pairing?.qrPayload && (
        <div className='flex flex-wrap items-start gap-16px' data-testid='opl-remote-companion-access-qr-ready'>
          <div className='flex flex-col items-center gap-6px'>
            <QRCodeSVG
              value={result.pairing.qrPayload}
              size={176}
              level='M'
              includeMargin
              aria-label={t('common.oplUiContributions.remoteCompanionAccess.qrCode')}
            />
          </div>
          {result.pairing.manualCode && (
            <div className='flex min-w-180px flex-col gap-6px'>
              <Typography.Text type='secondary'>
                {t('common.oplUiContributions.remoteCompanionAccess.shortCode')}
              </Typography.Text>
              <Typography.Text className='text-18px font-600 tracking-2px'>
                {formatManualCode(result.pairing.manualCode)}
              </Typography.Text>
            </div>
          )}
        </div>
      )}

      {result.status === 'awaiting_confirmation' && result.pairing?.authenticationDigits && (
        <div className='flex min-w-0 flex-col gap-6px' data-testid='opl-remote-companion-access-confirmation'>
          <Typography.Text type='secondary'>
            {t('common.oplUiContributions.remoteCompanionAccess.authentication')}
          </Typography.Text>
          <Typography.Text className='text-20px font-600 tracking-2px'>
            {formatAuthenticationDigits(result.pairing.authenticationDigits)}
          </Typography.Text>
          <Input
            value={authenticationDigits}
            onChange={(value) => setAuthenticationDigits(value.replace(/\D/gu, '').slice(0, 6))}
            maxLength={6}
            inputMode='numeric'
            autoComplete='off'
            placeholder={t('common.oplUiContributions.remoteCompanionAccess.authenticationPlaceholder')}
            aria-label={t('common.oplUiContributions.remoteCompanionAccess.authentication')}
          />
        </div>
      )}

      {(result.status === 'active' || result.status === 'revoking') && result.devices && (
        <section className='flex min-w-0 flex-col gap-6px' data-testid='opl-remote-companion-access-devices'>
          <Typography.Text bold>{t('common.oplUiContributions.remoteCompanionAccess.devices')}</Typography.Text>
          {result.devices.map((device) => (
            <div
              key={device.deviceId}
              className='flex min-w-0 flex-wrap items-end gap-8px border-0 border-t border-solid border-line py-8px'
            >
              <div className='min-w-160px flex-1'>
                <Typography.Text className='block break-all'>{device.displayName}</Typography.Text>
                <Typography.Text type='secondary' className='block text-12px'>
                  {t(`common.oplUiContributions.remoteCompanionAccess.deviceTypes.${device.deviceType}`)}
                </Typography.Text>
              </div>
              {result.actions.some(
                (action) => action.commandId === 'device.rename' && action.input.device_id === device.deviceId
              ) && (
                <label className='flex min-w-180px flex-1 flex-col gap-4px'>
                  <Typography.Text type='secondary'>
                    {t('common.oplUiContributions.remoteCompanionAccess.deviceName')}
                  </Typography.Text>
                  <Input
                    value={deviceNames[device.deviceId] ?? device.displayName}
                    onChange={(value) => setDeviceNames((current) => ({ ...current, [device.deviceId]: value }))}
                    maxLength={256}
                    autoComplete='off'
                  />
                </label>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default RemoteCompanionAccessView;
