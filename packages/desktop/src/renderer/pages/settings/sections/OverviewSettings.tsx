/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Typography } from '@arco-design/web-react';
import { FolderOpen, Lightning, Right, Toolkit } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { isReadyStatus, moduleRecords, moduleSource, moduleStatus } from './runtimeStateView';

const DEVELOPER_SOURCE_MODES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

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
  const modules = oplRecord(appState.modules);
  const modulesSummary = oplRecord(modules.summary);
  const moduleItems = moduleRecords(modules.items ?? modules.modules);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ??
    oplString(paths.workspace_root) ??
    oplString(oplRecord(paths.family_workspace_root).path) ??
    oplString(paths.family_workspace_root);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'unknown';
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
  const overviewNeedsAction = !workspaceRoot || modulesNeedAction;

  const openWorkspace = () => {
    if (!workspaceRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: workspaceRoot, tool: 'explorer' });
  };

  const quickEntries = [
    {
      key: 'model-access',
      title: t('settings.overviewPage.quickEntries.modelAccount.title'),
      description: t('settings.overviewPage.quickEntries.modelAccount.description'),
      route: '/settings/access',
      icon: <Right theme='outline' />,
    },
    {
      key: 'capabilities',
      title: t('settings.overviewPage.quickEntries.capabilities.title'),
      description: t('settings.overviewPage.quickEntries.capabilities.description'),
      route: '/settings/capabilities',
      icon: <Lightning theme='outline' />,
    },
    {
      key: 'maintenance',
      title: t('settings.overviewPage.quickEntries.maintenance.title'),
      description: t('settings.overviewPage.quickEntries.maintenance.description'),
      route: '/settings/environment',
      icon: <Toolkit theme='outline' />,
    },
  ];

  const content = (
    <div className='opl-settings-page'>
      <header className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4}>{t('settings.overviewPage.title')}</Typography.Title>
          <Typography.Text>{t('settings.overviewPage.description')}</Typography.Text>
        </div>
      </header>

      <section className='opl-settings-section' id='status'>
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
                ? t('settings.oplEnvironmentPage.healthSummary.values.canUseWithAttention')
                : t('settings.oplEnvironmentPage.healthSummary.values.canUse')}
            </span>
          </div>
        </div>
      </section>

      {overviewNeedsAction && (
        <section className='opl-settings-section' id='attention'>
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
          <div className='opl-settings-list'>
            {!workspaceRoot && (
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.overviewPage.attention.workspaceTitle')}
                  </Typography.Text>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.overviewPage.workspace.notConfigured')}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta'>
                  <Button type='primary' onClick={() => navigate('/settings/workspace')}>
                    {t('settings.overviewPage.workspace.changeOrVerify')}
                  </Button>
                </div>
              </div>
            )}
            {modulesNeedAction && (
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.overviewPage.attention.capabilitiesTitle')}
                  </Typography.Text>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.oplEnvironmentPage.modulesReadyCount', { ready: readyModules, total: totalModules })}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta'>
                  <Button onClick={() => navigate('/settings/environment#capability-packages')}>
                    {t('settings.overviewPage.actions.openRuntimeSettings')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className='opl-settings-section' id='workspace'>
        <div className='opl-settings-section__header'>
          <div className='flex min-w-0 items-start gap-10px'>
            <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
              <FolderOpen theme='outline' />
            </span>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.overviewPage.workspace.title')}
              </Typography.Text>
              <Typography.Text className='block break-all text-12px text-t-secondary'>
                {workspaceRoot
                  ? t('settings.overviewPage.workspace.currentPath', { path: workspaceRoot })
                  : t('settings.overviewPage.workspace.notConfigured')}
              </Typography.Text>
            </div>
          </div>
          <span
            className={`opl-settings-status ${workspaceRoot ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
          >
            {workspaceRoot
              ? t('settings.overviewPage.workspace.status.ready')
              : t('settings.overviewPage.workspace.status.needsAction')}
          </span>
        </div>
        <div className='opl-settings-list'>
          <div className='opl-settings-row'>
            <div className='opl-settings-row__main'>
              <Typography.Text className='font-500 text-t-primary'>
                {t('settings.overviewPage.workspace.permissionLabel')}
              </Typography.Text>
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.overviewPage.workspace.permissionStatus', {
                  mode: t(`agentMode.${permissionMode}`, { defaultValue: permissionMode }),
                })}
              </Typography.Text>
            </div>
            <div className='opl-settings-row__meta'>
              <Button disabled={!workspaceRoot} onClick={openWorkspace}>
                {t('settings.overviewPage.workspace.open')}
              </Button>
              <Button onClick={() => navigate('/settings/workspace#permissions')}>
                {t('settings.overviewPage.workspace.changeOrVerify')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className='opl-settings-section' id='shortcuts'>
        <div className='opl-settings-section__header'>
          <div>
            <Typography.Text className='block font-600 text-t-primary'>
              {t('settings.overviewPage.shortcuts.title')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary'>
              {t('settings.overviewPage.shortcuts.description')}
            </Typography.Text>
          </div>
        </div>
        <div className='opl-settings-list'>
          {quickEntries.map((entry) => (
            <button
              key={entry.key}
              type='button'
              className='opl-settings-row w-full border-0 bg-transparent text-left cursor-pointer hover:bg-fill-1'
              onClick={() => navigate(entry.route)}
            >
              <span className='opl-settings-row__main'>
                <Typography.Text className='font-500 text-t-primary'>{entry.title}</Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>{entry.description}</Typography.Text>
              </span>
              <span className='opl-settings-row__meta text-t-tertiary'>{entry.icon}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default OverviewSettings;
