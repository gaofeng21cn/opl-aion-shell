/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  hasPackageContributionExecuteAction,
  readOplUiContributionsProjection,
  resolveOplUiContributionLabel,
  type OplUiContribution,
  type OplUiContributionCommand,
  type OplUiContributionSlot,
} from '@/common/types/opl/uiContributions';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Message, Modal, Tag, Tooltip } from '@arco-design/web-react';
import { Play, Puzzle } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './OplUiContributionSlot.module.css';

type OplUiContributionSlotProps = {
  slot: OplUiContributionSlot;
};

function supportedEntry(entry: OplUiContribution): boolean {
  return entry.contributionKind === 'command_group' || (entry.contributionKind === 'view' && Boolean(entry.view));
}

const OplUiContributionSlotView: React.FC<OplUiContributionSlotProps> = ({ slot }) => {
  const { t, i18n } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const appStateQuery = useOplAppState('fast');
  const [runningCommandKey, setRunningCommandKey] = useState<string | null>(null);
  const projection = useMemo(() => readOplUiContributionsProjection(appStateQuery.appState), [appStateQuery.appState]);
  const entries = useMemo(() => projection.entries.filter((entry) => entry.slot === slot), [projection.entries, slot]);
  const actionAvailable = hasPackageContributionExecuteAction(appStateQuery.appState);
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'en-US';

  const executeCommand = useCallback(
    async (entry: OplUiContribution, command: OplUiContributionCommand, confirmed: boolean) => {
      const commandKey = `${entry.contributionKey}:${command.commandId}`;
      setRunningCommandKey(commandKey);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'package_contribution_execute',
          payloadJson: {
            package_id: entry.packageId,
            ref: command.actionRef,
            input: {},
            confirmed,
          },
          dryRun: false,
        });
        if (result?.ok === false) throw new Error(result.error?.message || result.command);
        const readback = await appStateQuery.load('fast', { forceFresh: true });
        if (!readback) throw new Error(t('common.oplUiContributions.readbackFailed'));
        message.success(t('common.oplUiContributions.executeSuccess'));
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('common.oplUiContributions.executeFailed'));
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
        void executeCommand(entry, command, false);
        return;
      }
      const label = resolveOplUiContributionLabel(command.label, locale, command.commandId);
      Modal.confirm({
        title: t('common.oplUiContributions.confirmTitle', { command: label }),
        content: t('common.oplUiContributions.confirmDescription', { package: entry.packageId }),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: () => executeCommand(entry, command, true),
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
                      const commandKey = `${entry.contributionKey}:${command.commandId}`;
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
