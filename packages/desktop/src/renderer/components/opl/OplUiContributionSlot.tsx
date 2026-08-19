/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { REMOTE_COMPANION_ACCESS_VIEW_TYPE } from '@/common/types/opl/remoteCompanionAccess';
import {
  activeOplChannelAccessQrChallenge,
  hasPackageContributionExecuteAction,
  readOplChannelAccessResult,
  readOplPackageContributionReadResult,
  resolveOplUiContributionLabel,
  type OplChannelAccessAction,
  type OplChannelAccessResult,
  type OplUiContribution,
  type OplUiContributionCommand,
  type OplUiContributionSlot,
} from '@/common/types/opl/uiContributions';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { getOplClientCordisComposition } from '@/renderer/services/oplClientCordis';
import { Alert, Button, Message, Modal, Spin, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Play, Puzzle } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import RemoteCompanionAccessView from './RemoteCompanionAccessView';
import styles from './OplUiContributionSlot.module.css';

type OplUiContributionSlotProps = {
  slot: OplUiContributionSlot;
};

function supportedEntry(entry: OplUiContribution): boolean {
  return entry.contributionKind === 'command_group' || (entry.contributionKind === 'view' && Boolean(entry.view));
}

function admittedInAionUi(entry: OplUiContribution): boolean {
  // AionCore owns its built-in channel settings. Framework connector views are
  // admitted by their activation boundary, not by a package-name allowlist.
  if (entry.view?.viewType === 'channel_access' && entry.actionBoundary === 'opl.connect.channel-provider-host')
    return false;
  if (entry.view?.viewType === REMOTE_COMPANION_ACCESS_VIEW_TYPE) {
    return entry.actionBoundary === 'opl.connect.remote-companion-connector';
  }
  return true;
}

function commandInvocationKey(entry: OplUiContribution, commandId: string, input: Record<string, unknown>): string {
  const safeInput = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'authentication_string' && key !== 'claim_secret')
  );
  return `${entry.contributionKey}:${commandId}:${JSON.stringify(safeInput)}`;
}

type ChannelAccessViewProps = {
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

const CONNECTION_STATE_KEYS = {
  disconnected: 'common.oplUiContributions.channelAccess.states.disconnected',
  connecting: 'common.oplUiContributions.channelAccess.states.connecting',
  qr_ready: 'common.oplUiContributions.channelAccess.states.qrReady',
  qr_scanned: 'common.oplUiContributions.channelAccess.states.qrScanned',
  connected: 'common.oplUiContributions.channelAccess.states.connected',
  attention: 'common.oplUiContributions.channelAccess.states.attention',
} as const;

const ChannelAccessView: React.FC<ChannelAccessViewProps> = ({
  entry,
  locale,
  actionAvailable,
  runningCommandKey,
  executeCommand,
}) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<OplChannelAccessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [qrExpiryTick, setQrExpiryTick] = useState(0);
  const view = entry.view;
  const qrConnection = result?.status === 'available' ? result.connection : null;
  const projectedQrChallenge = qrConnection?.qrChallenge;

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
      const channelResult = readOplChannelAccessResult(readResult);
      if (!channelResult) throw new Error('invalid channel access response');
      setResult(channelResult);
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
  }, [load, result?.refreshAfterMs, result]);

  useEffect(() => {
    if (qrConnection?.state !== 'qr_ready' || !projectedQrChallenge) return;
    const remainingMs = projectedQrChallenge.expiresAtMs - Date.now();
    if (remainingMs <= 0) return;
    const timer = window.setTimeout(
      () => setQrExpiryTick((current) => current + 1),
      Math.min(remainingMs + 1, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [projectedQrChallenge, qrConnection?.state, qrExpiryTick]);

  const requestAction = useCallback(
    (action: OplChannelAccessAction) => {
      const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
      if (!command || !actionAvailable) return;
      const run = async () => {
        if (await executeCommand(entry, command, command.confirmationRequired, action.input)) await load();
      };
      if (!command.confirmationRequired) {
        void run();
        return;
      }
      const label = resolveOplUiContributionLabel(command.label, locale, command.commandId);
      Modal.confirm({
        title: t('common.oplUiContributions.confirmTitle', { command: label }),
        content: t('common.oplUiContributions.confirmDescription', { package: entry.packageId }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: run,
      });
    },
    [actionAvailable, entry, executeCommand, load, locale, t]
  );

  const actions = (values: OplChannelAccessAction[]) => (
    <div className='flex min-h-28px flex-wrap items-center gap-6px'>
      {values.flatMap((action) => {
        const command = entry.commands.find((candidate) => candidate.commandId === action.commandId);
        if (!command) return [];
        const key = commandInvocationKey(entry, command.commandId, action.input);
        return [
          <Button
            key={key}
            size='small'
            type='text'
            icon={<Play aria-hidden='true' theme='outline' size={13} fill='currentColor' />}
            disabled={!actionAvailable}
            loading={runningCommandKey === key}
            onClick={() => requestAction(action)}
          >
            {resolveOplUiContributionLabel(command.label, locale, command.commandId)}
          </Button>,
        ];
      })}
    </div>
  );

  if (loading && !result) {
    return (
      <div className='flex min-h-72px items-center justify-center' data-testid='opl-channel-access-loading'>
        <Spin />
      </div>
    );
  }
  if (loadError || !result) {
    return (
      <Alert
        type='warning'
        showIcon
        content={t('common.oplUiContributions.channelAccess.readFailed')}
        data-testid='opl-channel-access-read-failed'
      />
    );
  }
  if (result.status === 'unavailable') {
    return (
      <Alert
        type='info'
        showIcon
        content={t('common.oplUiContributions.channelAccess.unavailable')}
        data-testid='opl-channel-access-unavailable'
      />
    );
  }

  const displayTime = (value: number) => new Date(value).toLocaleString(locale);
  const qrChallenge = activeOplChannelAccessQrChallenge(result.connection, Date.now());
  return (
    <div className='flex min-w-0 flex-col gap-12px' data-testid='opl-channel-access'>
      <div className='flex min-w-0 flex-wrap items-center gap-8px'>
        <Tag color={result.connection.state === 'connected' ? 'green' : undefined}>
          {t(CONNECTION_STATE_KEYS[result.connection.state])}
        </Tag>
        {result.connection.accountDisplayName && (
          <Typography.Text className='min-w-0 break-all'>{result.connection.accountDisplayName}</Typography.Text>
        )}
        {result.connection.reasonCode && <Tag>{result.connection.reasonCode}</Tag>}
        <div className='ml-auto'>{actions(result.actions)}</div>
      </div>

      {qrChallenge && (
        <div className='flex justify-center py-8px' data-testid='opl-channel-access-qr'>
          <QRCodeSVG
            value={qrChallenge.payload}
            size={160}
            aria-label={t('common.oplUiContributions.channelAccess.qrCode')}
          />
        </div>
      )}

      <section className='flex min-w-0 flex-col gap-6px'>
        <Typography.Text bold>{t('common.oplUiContributions.channelAccess.pendingPairings')}</Typography.Text>
        {result.pendingPairings.length === 0 ? (
          <Typography.Text type='secondary'>{t('common.oplUiContributions.channelAccess.none')}</Typography.Text>
        ) : (
          result.pendingPairings.map((pairing) => (
            <div
              key={pairing.pairingId}
              className='flex min-w-0 flex-wrap items-center gap-8px border-0 border-t border-solid border-line py-8px'
            >
              <div className='min-w-160px flex-1'>
                <Typography.Text className='block break-all'>
                  {pairing.displayName ?? pairing.platformUserId ?? pairing.pairingId}
                </Typography.Text>
                <Typography.Text type='secondary' className='block text-12px'>
                  {t('common.oplUiContributions.channelAccess.expiresAt', { time: displayTime(pairing.expiresAtMs) })}
                </Typography.Text>
              </div>
              {actions(pairing.actions)}
            </div>
          ))
        )}
      </section>

      <section className='flex min-w-0 flex-col gap-6px'>
        <Typography.Text bold>{t('common.oplUiContributions.channelAccess.authorizedUsers')}</Typography.Text>
        {result.authorizedUsers.length === 0 ? (
          <Typography.Text type='secondary'>{t('common.oplUiContributions.channelAccess.none')}</Typography.Text>
        ) : (
          result.authorizedUsers.map((user) => (
            <div
              key={user.userId}
              className='flex min-w-0 flex-wrap items-center gap-8px border-0 border-t border-solid border-line py-8px'
            >
              <div className='min-w-160px flex-1'>
                <Typography.Text className='block break-all'>
                  {user.displayName ?? user.platformUserId ?? user.userId}
                </Typography.Text>
                <Typography.Text type='secondary' className='block text-12px'>
                  {t('common.oplUiContributions.channelAccess.authorizedAt', {
                    time: displayTime(user.authorizedAtMs),
                  })}
                </Typography.Text>
              </div>
              {actions(user.actions)}
            </div>
          ))
        )}
      </section>
    </div>
  );
};

const OplUiContributionSlotView: React.FC<OplUiContributionSlotProps> = ({ slot }) => {
  const { t, i18n } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const appStateQuery = useOplAppState('fast');
  const [runningCommandKey, setRunningCommandKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly OplUiContribution[]>([]);
  const actionAvailable = hasPackageContributionExecuteAction(appStateQuery.appState);
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'en-US';

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getOplClientCordisComposition()
      .then((composition) => {
        if (!active) return;
        const refresh = () => {
          if (active) setEntries(composition.contributions.readSlot(slot).filter(admittedInAionUi));
        };
        unsubscribe = composition.contributions.subscribe(refresh);
        composition.contributions.updateHostProjection(appStateQuery.appState);
        refresh();
      })
      .catch((error) => {
        if (!active) return;
        console.error('Failed to initialize OPL Client Cordis', error);
        setEntries([]);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [appStateQuery.appState, slot]);

  const executeCommand = useCallback(
    async (
      entry: OplUiContribution,
      command: OplUiContributionCommand,
      confirmed: boolean,
      input: Record<string, unknown> = {}
    ): Promise<boolean> => {
      const commandKey = commandInvocationKey(entry, command.commandId, input);
      setRunningCommandKey(commandKey);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'package_contribution_execute',
          payloadJson: {
            package_id: entry.packageId,
            ref: command.actionRef,
            input,
            confirmed,
          },
          dryRun: false,
        });
        if (result?.ok === false) throw new Error(result.error?.message || result.command);
        const readback = await appStateQuery.load('fast', { forceFresh: true });
        if (!readback) throw new Error(t('common.oplUiContributions.readbackFailed'));
        message.success(t('common.oplUiContributions.executeSuccess'));
        return true;
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('common.oplUiContributions.executeFailed'));
        return false;
      } finally {
        setRunningCommandKey(null);
      }
    },
    [appStateQuery.load, message, t]
  );

  const requestCommand = useCallback(
    (entry: OplUiContribution, command: OplUiContributionCommand) => {
      if (!actionAvailable) return;
      if (!command.confirmationRequired) {
        void executeCommand(entry, command, false, {});
        return;
      }
      const label = resolveOplUiContributionLabel(command.label, locale, command.commandId);
      Modal.confirm({
        title: t('common.oplUiContributions.confirmTitle', { command: label }),
        content: t('common.oplUiContributions.confirmDescription', { package: entry.packageId }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: () => executeCommand(entry, command, true, {}),
      });
    },
    [actionAvailable, executeCommand, locale, t]
  );

  if (entries.length === 0) return null;

  return (
    <div
      className={classNames(styles.slot, {
        [styles.composer]: slot === 'composer.palette',
        [styles.runtime]: slot === 'runtime.detail',
        [styles.settings]: slot === 'settings.section',
      })}
      data-opl-ui-contribution-slot={slot}
      data-testid={`opl-ui-contribution-slot-${slot}`}
    >
      {messageContextHolder}
      {entries.map((entry) => {
        const title = entry.view
          ? resolveOplUiContributionLabel(entry.view.title, locale, entry.contributionId)
          : entry.contributionId;
        const supported = supportedEntry(entry);
        return (
          <section
            key={entry.contributionKey}
            className={styles.entry}
            data-testid={`opl-ui-contribution-${entry.contributionKey}`}
          >
            <header className={styles.header}>
              <span className={styles.title}>
                <Puzzle aria-hidden='true' theme='outline' size={15} fill='currentColor' />
                <span className={styles.titleText}>{title}</span>
              </span>
              <Tag size='small'>{entry.packageId}</Tag>
            </header>
            {supported ? (
              entry.view?.viewType === 'channel_access' ? (
                <ChannelAccessView
                  entry={entry}
                  locale={locale}
                  actionAvailable={actionAvailable}
                  runningCommandKey={runningCommandKey}
                  executeCommand={executeCommand}
                />
              ) : entry.view?.viewType === REMOTE_COMPANION_ACCESS_VIEW_TYPE ? (
                <RemoteCompanionAccessView
                  entry={entry}
                  locale={locale}
                  actionAvailable={actionAvailable}
                  runningCommandKey={runningCommandKey}
                  executeCommand={executeCommand}
                />
              ) : (
                <>
                  {entry.badges.length > 0 && (
                    <div className={styles.badges}>
                      {entry.badges.map((badge) => (
                        <Tag key={badge.badgeId} size='small' data-tone={badge.tone}>
                          {resolveOplUiContributionLabel(badge.label, locale, badge.badgeId)}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {entry.commands.length > 0 && (
                    <div className={styles.actions}>
                      {entry.commands.map((command) => {
                        const commandKey = commandInvocationKey(entry, command.commandId, {});
                        const label = resolveOplUiContributionLabel(command.label, locale, command.commandId);
                        return (
                          <Tooltip
                            key={command.commandId}
                            content={
                              actionAvailable
                                ? command.confirmationRequired
                                  ? t('common.oplUiContributions.confirmationRequired')
                                  : label
                                : t('common.oplUiContributions.actionUnavailable')
                            }
                          >
                            <Button
                              size='small'
                              type='text'
                              icon={<Play aria-hidden='true' theme='outline' size={13} fill='currentColor' />}
                              disabled={!actionAvailable}
                              loading={runningCommandKey === commandKey}
                              onClick={() => requestCommand(entry, command)}
                            >
                              {label}
                            </Button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </>
              )
            ) : (
              <p className={styles.fallback} role='status'>
                {t('common.oplUiContributions.unsupportedKind', { kind: entry.contributionKind })}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default OplUiContributionSlotView;
