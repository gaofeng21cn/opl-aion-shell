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
import React, { useCallback, useEffect, useState } from 'react';
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

function invocationKey(entry: OplUiContribution, commandId: string, input: Record<string, unknown>): string {
  const safeInput = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'authentication_string' && key !== 'claim_secret')
  );
  return `${entry.contributionKey}:${commandId}:${JSON.stringify(safeInput)}`;
}

function actionLabel(
  action: OplRemoteCompanionAccessAction,
  command: OplUiContributionCommand,
  locale: string
): string {
  return resolveOplUiContributionLabel(command.label, locale, action.commandId);
}

function formatShortCode(value: string): string {
  return value.replace(/(.{4})(.{4})(.{4})/u, '$1 $2 $3');
}

const stateTagColors: Partial<Record<OplRemoteCompanionAccessResult['state'], 'green' | 'orange' | 'red'>> = {
  active: 'green',
  attention: 'orange',
  revoking: 'orange',
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
  const [displayName, setDisplayName] = useState('');
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
      if (remoteResult.status === 'available' && remoteResult.account?.displayName) {
        setDisplayName(remoteResult.account.displayName);
      }
    } catch {
      setResult(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [entry.packageId, view]);

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

  const requestAction = useCallback(
    (action: OplRemoteCompanionAccessAction) => {
      const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
      if (!command || !actionAvailable || !result) return;
      const input =
        action.actionKind === 'rename'
          ? prepareOplRemoteCompanionAccessActionInput(action, undefined, displayName)
          : prepareOplRemoteCompanionAccessActionInput(
              action,
              result.status === 'available' ? result.pairing : undefined
            );
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
    [actionAvailable, displayName, entry, executeCommand, load, locale, message, result, t]
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
  if (result.state === 'unavailable') {
    const refreshAction = result.actions.find(
      (action) => action.actionKind === 'refresh' || action.actionKind === 'retry'
    );
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

  const actions = result.actions.flatMap((action) => {
    const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
    if (!command) return [];
    const input =
      action.actionKind === 'rename'
        ? { ...action.input, display_name: displayName.trim() }
        : action.actionKind === 'confirm' && result.pairing?.authenticationString
          ? action.input
          : action.input;
    const key = invocationKey(entry, command.commandId, input);
    return [
      <Button
        key={`${action.actionKind}:${command.commandId}`}
        size='small'
        type={action.actionKind === 'revoke' ? 'outline' : 'text'}
        status={action.actionKind === 'revoke' ? 'danger' : undefined}
        icon={
          <OplIcon
            name={action.actionKind === 'refresh' ? 'refreshSmall' : action.actionKind === 'revoke' ? 'trash' : 'link'}
          />
        }
        disabled={!actionAvailable || (action.actionKind === 'rename' && !displayName.trim())}
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
        <Tag color={stateTagColors[result.state]}>
          {t(`common.oplUiContributions.remoteCompanionAccess.states.${result.state}`)}
        </Tag>
        {result.status === 'available' && result.account?.displayName && (
          <Typography.Text className='min-w-0 break-all'>{result.account.displayName}</Typography.Text>
        )}
        <div className='ml-auto flex flex-wrap items-center gap-6px'>{actions}</div>
      </div>

      {result.status === 'available' && result.state === 'qr_ready' && result.pairing && (
        <div className='flex flex-wrap items-start gap-16px' data-testid='opl-remote-companion-access-qr-ready'>
          <div className='flex flex-col items-center gap-6px'>
            <QRCodeSVG
              value={result.pairing.qrPayload ?? ''}
              size={176}
              level='M'
              includeMargin
              aria-label={t('common.oplUiContributions.remoteCompanionAccess.qrCode')}
            />
          </div>
          {result.pairing.shortCode && (
            <div className='flex min-w-180px flex-col gap-6px'>
              <Typography.Text type='secondary'>
                {t('common.oplUiContributions.remoteCompanionAccess.shortCode')}
              </Typography.Text>
              <Typography.Text className='text-18px font-600 tracking-2px'>
                {formatShortCode(result.pairing.shortCode)}
              </Typography.Text>
            </div>
          )}
        </div>
      )}

      {result.status === 'available' && result.state === 'awaiting_confirmation' && result.pairing && (
        <div className='flex flex-col gap-6px' data-testid='opl-remote-companion-access-confirmation'>
          <Typography.Text type='secondary'>
            {t('common.oplUiContributions.remoteCompanionAccess.authentication')}
          </Typography.Text>
          <Typography.Text className='text-20px font-600 tracking-2px'>
            {result.pairing.authenticationString}
          </Typography.Text>
        </div>
      )}

      {result.status === 'available' && result.state === 'active' && result.account && (
        <div className='flex flex-wrap items-end gap-8px' data-testid='opl-remote-companion-access-active'>
          {result.actions.some((action) => action.actionKind === 'rename') && (
            <label className='flex min-w-180px flex-1 flex-col gap-4px'>
              <Typography.Text type='secondary'>
                {t('common.oplUiContributions.remoteCompanionAccess.deviceLabel')}
              </Typography.Text>
              <Input value={displayName} onChange={setDisplayName} maxLength={128} />
            </label>
          )}
        </div>
      )}

      {result.reasonCode && (
        <Typography.Text type='secondary' className='break-all'>
          {result.reasonCode}
        </Typography.Text>
      )}
    </div>
  );
};

export default RemoteCompanionAccessView;
