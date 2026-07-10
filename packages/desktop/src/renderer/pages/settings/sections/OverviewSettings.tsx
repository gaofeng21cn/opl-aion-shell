/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
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

const OverviewSettings: React.FC<OverviewSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const executor = oplRecord(core.executor);
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
  const attentionCount = Number(workspaceNeedsAction) + Number(modulesNeedAction);
  const overviewNeedsAction = attentionCount > 0;

  const nextAction = workspaceNeedsAction
    ? {
        title: t('settings.overviewPage.attention.workspaceTitle'),
        description: t('settings.overviewPage.workspace.notConfigured'),
        label: t('settings.overviewPage.workspace.changeOrVerify'),
        route: '/settings/workspace',
      }
    : modulesNeedAction
      ? {
          title: t('settings.overviewPage.attention.capabilitiesTitle'),
          description: t('settings.oplEnvironmentPage.modulesReadyCount', {
            ready: readyModules,
            total: totalModules,
          }),
          label: t('settings.overviewPage.actions.openRuntimeSettings'),
          route: '/settings/environment?section=packages',
        }
      : null;

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
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>{nextAction.title}</Typography.Text>
              <Typography.Text className='text-12px text-t-secondary'>{nextAction.description}</Typography.Text>
            </div>
            <div className='opl-settings-row__meta'>
              <Button
                type='primary'
                onClick={() => navigate(nextAction.route)}
                data-testid='settings-overview-primary-action'
              >
                {nextAction.label}
              </Button>
            </div>
          </div>
        </section>
      )}

      <details className='opl-settings-details' data-testid='settings-overview-technical-details'>
        <summary>{t('common.technical_details')}</summary>
        <div className='mt-12px space-y-6px text-12px text-t-secondary'>
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
        </div>
      </details>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
