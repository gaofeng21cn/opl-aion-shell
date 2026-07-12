/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Modal, Typography } from '@arco-design/web-react';
import { CheckOne, FolderOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { buildAccessProjection } from '../accessProjection';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { isReadyStatus, moduleRecords, moduleSource, moduleStatus, oplPathString } from './runtimeStateView';

const DEVELOPER_SOURCE_MODES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);
const WORKSPACE_PERMISSION_ATTENTION_MODES = new Set(['read-only', 'plan']);
const AVAILABLE_WORKSPACE_HEALTH = new Set(['available', 'healthy', 'ok', 'ready']);
const UNKNOWN_WORKSPACE_HEALTH = new Set(['not_reported', 'unknown']);

type OverviewSettingsProps = {
  withWrapper?: boolean;
};

type AttentionItem = {
  title: string;
  description: string;
  label: string;
  route: string;
};

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const paths = oplRecord(appState.paths);
  const workspaceRootRecord = oplRecord(paths.workspace_root);
  const modules = oplRecord(appState.modules);
  const modulesSummary = oplRecord(modules.summary);
  const moduleItems = moduleRecords(modules.items ?? modules.modules);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ??
    oplPathString(paths.workspace_root) ??
    oplPathString(paths.family_workspace_root);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'unknown';
  const workspaceRootHealth = oplString(workspaceRootRecord.health_status) ?? oplString(workspaceRootRecord.status);
  const workspaceHealthNeedsAction = Boolean(
    workspaceRootHealth &&
    !UNKNOWN_WORKSPACE_HEALTH.has(workspaceRootHealth) &&
    !AVAILABLE_WORKSPACE_HEALTH.has(workspaceRootHealth)
  );
  const workspaceNeedsAction =
    !workspaceRoot ||
    workspaceRootRecord.exists === false ||
    workspaceRootRecord.writable === false ||
    workspaceHealthNeedsAction ||
    WORKSPACE_PERMISSION_ATTENTION_MODES.has(permissionMode);
  const totalModules = Number(modulesSummary.default_modules_count ?? modulesSummary.total ?? 0);
  const readyModules = Number(modulesSummary.healthy_default_modules_count ?? modulesSummary.ready ?? 0);
  const modulesSourceMode = oplString(oplRecord(modules.source).mode) ?? oplString(modules.source);
  const developerSourceActive =
    Boolean(modulesSourceMode && DEVELOPER_SOURCE_MODES.has(modulesSourceMode)) ||
    moduleItems.some((module) => {
      const source = moduleSource(module);
      return Boolean(source && DEVELOPER_SOURCE_MODES.has(source));
    });
  const actionableModuleIssue = moduleItems.some((module) => {
    const source = moduleSource(module) ?? modulesSourceMode;
    return !isReadyStatus(moduleStatus(module)) && !(source && DEVELOPER_SOURCE_MODES.has(source));
  });
  const modulesNeedAction =
    actionableModuleIssue ||
    (moduleItems.length === 0 && totalModules > 0 && readyModules < totalModules && !developerSourceActive);
  const { cards: accessCards } = buildAccessProjection(appState, t);
  const modelAccessCard = accessCards.find((card) => card.key === 'account');
  const modelAccessNeedsAction = modelAccessCard?.tone === 'orange';
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status);
  const temporalNeedsAction = Boolean(temporalStatus && !isReadyStatus(temporalStatus));
  const attentionCount =
    Number(workspaceNeedsAction) +
    Number(modelAccessNeedsAction) +
    Number(temporalNeedsAction) +
    Number(modulesNeedAction);
  const overviewNeedsAction = attentionCount > 0;

  const attentionItems = [
    workspaceNeedsAction
      ? {
          title: t('settings.overviewPage.attention.workspaceTitle'),
          description: t('settings.overviewPage.workspace.notConfigured'),
          label: t('settings.overviewPage.workspace.changeOrVerify'),
          route: '/settings/workspace',
        }
      : null,
    modelAccessNeedsAction
      ? {
          title: t('settings.overviewPage.quickEntries.modelAccount.title'),
          description: t('settings.overviewPage.quickEntries.modelAccount.description'),
          label: t('common.open'),
          route: '/settings/access',
        }
      : null,
    temporalNeedsAction
      ? {
          title: t('settings.overviewPage.quickEntries.localServices.title'),
          description: t('settings.overviewPage.quickEntries.localServices.description'),
          label: t('settings.overviewPage.actions.openRuntimeSettings'),
          route: '/settings/environment',
        }
      : null,
    modulesNeedAction
      ? {
          title: t('settings.overviewPage.attention.capabilitiesTitle'),
          description: t('settings.oplEnvironmentPage.modulesReadyCount', {
            ready: readyModules,
            total: totalModules,
          }),
          label: t('settings.overviewPage.actions.openRuntimeSettings'),
          route: '/settings/environment?section=packages',
        }
      : null,
  ].filter((item): item is AttentionItem => item !== null);
  const nextAction = attentionItems[0] ?? null;

  const contextualEntries = [
    {
      key: 'model-access',
      title: t('settings.overviewPage.quickEntries.modelAccount.title'),
      description: t('settings.overviewPage.quickEntries.modelAccount.description'),
      status:
        modelAccessCard?.tone === 'green'
          ? t('settings.accessPage.statusLabels.connected')
          : modelAccessNeedsAction
            ? t('settings.accessPage.statusLabels.needsAttention')
            : t('settings.accessPage.statusLabels.unknown'),
      statusClass:
        modelAccessCard?.tone === 'green'
          ? 'opl-settings-status--ready'
          : modelAccessNeedsAction
            ? 'opl-settings-status--attention'
            : '',
      icon: <CheckOne theme='outline' />,
      route: '/settings/access',
    },
    {
      key: 'workspace',
      title: t('settings.overviewPage.workspace.title'),
      description: workspaceRoot
        ? t('settings.overviewPage.workspace.currentPath', { path: workspaceRoot })
        : t('settings.overviewPage.workspace.notConfigured'),
      status: workspaceNeedsAction
        ? t('settings.overviewPage.workspace.status.needsAction')
        : t('settings.overviewPage.workspace.status.ready'),
      statusClass: workspaceNeedsAction ? 'opl-settings-status--attention' : 'opl-settings-status--ready',
      icon: <FolderOpen theme='outline' />,
      route: '/settings/workspace',
    },
  ];

  const content = (
    <div className='opl-settings-page' data-testid='settings-page-overview'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.overviewPage.title')}</Typography.Title>
          <Typography.Text>{t('settings.overviewPage.description')}</Typography.Text>
        </div>
      </header>

      <section className='opl-settings-section' id='status' data-testid='settings-overview-primary'>
        <div className='opl-settings-row'>
          <div className='opl-settings-row__main'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.overviewPage.overall.title')}
            </Typography.Text>
            <Typography.Text className='text-12px text-t-secondary'>
              {overviewNeedsAction
                ? t('settings.overviewPage.overall.attentionDescription')
                : t('settings.overviewPage.overall.readyDescription')}
            </Typography.Text>
          </div>
          <div className='opl-settings-row__meta'>
            <span
              className={`opl-settings-status ${overviewNeedsAction ? 'opl-settings-status--attention' : 'opl-settings-status--ready'}`}
              data-testid='settings-overview-status'
            >
              {overviewNeedsAction
                ? t('settings.overviewPage.overall.attentionCount', {
                    count: attentionCount,
                    defaultValue: t('settings.oplEnvironmentPage.healthSummary.values.count', {
                      count: attentionCount,
                    }),
                  })
                : t('settings.oplEnvironmentPage.healthSummary.values.canUse')}
            </span>
          </div>
        </div>
      </section>

      {nextAction && (
        <section
          className='opl-settings-section opl-settings-section--attention'
          id='next-action'
          data-testid='settings-overview-exception'
        >
          <div className='opl-settings-section__header'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.overviewPage.attention.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.overviewPage.attention.description')}
              </Typography.Text>
            </div>
          </div>
          <div className='opl-settings-list' data-testid='settings-overview-attention-list'>
            {attentionItems.map((item, index) => (
              <div className='opl-settings-row' key={item.route}>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>{item.title}</Typography.Text>
                  <Typography.Text className='text-12px text-t-secondary'>{item.description}</Typography.Text>
                </div>
                {index === 0 && (
                  <div className='opl-settings-row__meta'>
                    <Button
                      type='primary'
                      onClick={() => navigate(item.route)}
                      data-testid='settings-overview-primary-action'
                    >
                      {item.label}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className='grid grid-cols-1 gap-14px md:grid-cols-2' data-testid='settings-overview-summary-grid'>
        {contextualEntries.map((card) => (
          <section
            className='opl-settings-section flex'
            key={card.key}
            data-testid={`settings-overview-card-${card.key}`}
          >
            <div className='flex min-w-0 flex-1 flex-col gap-12px p-16px'>
              <div className='flex min-w-0 items-start justify-between gap-12px'>
                <span className='flex h-28px w-28px shrink-0 items-center justify-center rd-6px bg-fill-2 text-t-secondary'>
                  {card.icon}
                </span>
                {card.status && <span className={`opl-settings-status ${card.statusClass}`.trim()}>{card.status}</span>}
              </div>
              <div className='min-w-0 flex-1'>
                <Typography.Text className='block font-600 text-t-primary'>{card.title}</Typography.Text>
                <Typography.Text className='block break-words text-12px text-t-secondary'>
                  {card.description}
                </Typography.Text>
              </div>
              <Button type='text' className='self-start px-0' onClick={() => navigate(card.route)}>
                {t('common.open')}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <div className='flex justify-end'>
        <Button data-testid='settings-overview-diagnostics-action' onClick={() => setDiagnosticsVisible(true)}>
          {t('common.technical_details')}
        </Button>
      </div>
      <Modal
        visible={diagnosticsVisible}
        title={t('common.technical_details')}
        footer={null}
        onCancel={() => setDiagnosticsVisible(false)}
        unmountOnExit
        style={{ width: 'min(680px, calc(100vw - 48px))' }}
      >
        <div
          className='opl-settings-surface--diagnostic space-y-6px text-12px text-t-secondary'
          data-testid='settings-overview-technical-details'
        >
          <div className='break-all'>
            {workspaceRoot
              ? t('settings.overviewPage.workspace.currentPath', { path: workspaceRoot })
              : t('settings.overviewPage.workspace.notConfigured')}
          </div>
          <div>
            {t('settings.overviewPage.workspace.permissionStatus', {
              mode: t(`agentMode.${permissionMode}`, { defaultValue: permissionMode }),
            })}
          </div>
          <div>{t('settings.oplEnvironmentPage.modulesReadyCount', { ready: readyModules, total: totalModules })}</div>
          <div>{temporalStatus ?? t('settings.accessPage.statusLabels.unknown')}</div>
        </div>
      </Modal>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
