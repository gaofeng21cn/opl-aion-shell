/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { FolderOpen, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  formatStatus,
  isReadyStatus,
  moduleDisplayLabel,
  moduleId,
  modulePath,
  modulePathSource,
  moduleRecords,
  moduleStatus,
  normalizeModule,
  oplPathString,
} from './runtimeStateView';

type WorkspaceSettingsProps = {
  withWrapper?: boolean;
};

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const paths = oplRecord(appState.paths);
  const core = oplRecord(appState.core);
  const executor = oplRecord(core.executor);
  const codex = oplRecord(core.codex);
  const modulesPayload = oplRecord(appState.modules);
  const modulesSourcePayload = oplRecord(modulesPayload.source);
  const familyWorkspaceRoot = oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ?? oplPathString(paths.workspace_root) ?? familyWorkspaceRoot;
  const logsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'unknown';

  const modules = useMemo(
    () => moduleRecords(modulesPayload.items ?? modulesPayload.modules).map(normalizeModule),
    [modulesPayload.items, modulesPayload.modules]
  );

  const openFolder = (path: string | null) => {
    if (!path) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' });
  };

  const refresh = () => {
    void appStateQuery.load('fast', { showRefreshing: true });
  };

  const readyModules = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const workspaceReady = Boolean(workspaceRoot);

  const content = (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-col gap-8px md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.workspacePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.workspacePage.description')}</Typography.Text>
        </div>
        <Button icon={<Refresh theme='outline' />} loading={appStateQuery.refreshing} onClick={refresh}>
          {t('common.refresh')}
        </Button>
      </div>

      <Card bordered className='rd-8px' data-testid='opl-workspace-settings-root'>
        <div className='flex flex-col gap-14px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
            <div className='min-w-0'>
              <div className='flex items-center gap-8px mb-8px'>
                <span className='w-28px h-28px flex items-center justify-center rd-8px bg-fill-2 text-t-secondary'>
                  <FolderOpen theme='outline' />
                </span>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.workspacePage.root.title')}
                </Typography.Text>
              </div>
              <Typography.Text className='block text-13px text-t-secondary break-all'>
                {workspaceRoot
                  ? t('settings.workspacePage.root.current', { path: workspaceRoot })
                  : t('settings.workspacePage.root.missing')}
              </Typography.Text>
            </div>
            <Space wrap>
              <Tag color={workspaceReady ? 'green' : 'orange'}>
                {workspaceReady
                  ? t('settings.workspacePage.status.ready')
                  : t('settings.workspacePage.status.needsAction')}
              </Tag>
              <Button disabled={!workspaceRoot} onClick={() => openFolder(workspaceRoot)}>
                {t('settings.workspacePage.actions.openWorkspace')}
              </Button>
            </Space>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
            <div className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.workspacePage.cards.permission')}
              </Typography.Text>
              <Typography.Text className='block font-600 text-t-primary break-words'>
                {t(`agentMode.${permissionMode}`, { defaultValue: permissionMode })}
              </Typography.Text>
            </div>
            <div className='border border-solid border-border-1 rd-8px bg-fill-1 p-12px min-w-0'>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.workspacePage.cards.lastCheck')}
              </Typography.Text>
              <Typography.Text className='block font-600 text-t-primary break-words'>
                {appStateQuery.loadedAt ?? t('settings.oplEnvironmentPage.status.unknown')}
              </Typography.Text>
            </div>
          </div>
        </div>
      </Card>

      <details className='rd-8px border border-solid border-border-1 bg-fill-1 p-12px'>
        <summary className='cursor-pointer font-600 text-t-primary'>
          {t('settings.workspacePage.technical.title')}
        </summary>
        <div className='mt-12px flex flex-col gap-14px'>
          <Typography.Text className='text-12px text-t-secondary'>
            {t('settings.workspacePage.technical.description')}
          </Typography.Text>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
            <Card bordered className='rd-8px' data-testid='opl-workspace-settings-modules-root'>
              <div className='flex flex-col gap-12px'>
                <div className='flex items-start justify-between gap-12px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {t('settings.workspacePage.modulesRoot.title')}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-all'>
                      {modulesRoot
                        ? t('settings.workspacePage.modulesRoot.current', { path: modulesRoot })
                        : t('settings.workspacePage.modulesRoot.missing')}
                    </Typography.Text>
                  </div>
                  <Button disabled={!modulesRoot} onClick={() => openFolder(modulesRoot)}>
                    {t('common.open', { defaultValue: 'Open' })}
                  </Button>
                </div>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.workspacePage.modulesRoot.description')}
                </Typography.Text>
              </div>
            </Card>

            <Card bordered className='rd-8px' data-testid='opl-workspace-settings-logs'>
              <div className='flex flex-col gap-12px'>
                <div className='flex items-start justify-between gap-12px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {t('settings.workspacePage.logs.title')}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-all'>
                      {logsRoot
                        ? t('settings.workspacePage.logs.current', { path: logsRoot })
                        : t('settings.workspacePage.logs.missing')}
                    </Typography.Text>
                  </div>
                  <Button disabled={!logsRoot} onClick={() => openFolder(logsRoot)}>
                    {t('common.open', { defaultValue: 'Open' })}
                  </Button>
                </div>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.workspacePage.logs.description')}
                </Typography.Text>
              </div>
            </Card>
          </div>

          <Card bordered className='rd-8px'>
            <div className='flex flex-col gap-12px'>
              <div className='flex flex-col gap-4px'>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('settings.workspacePage.modules.title')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.workspacePage.modules.description', { ready: readyModules, total: modules.length })}
                </Typography.Text>
              </div>
              <div className='flex flex-col divide-y divide-border-1' data-testid='opl-workspace-settings-modules'>
                {modules.map((module, index) => {
                  const id = moduleId(module) || `module-${index + 1}`;
                  const status = moduleStatus(module);
                  const path = modulePath(module);
                  return (
                    <div
                      key={id}
                      className='flex flex-col gap-6px md:flex-row md:items-center md:justify-between py-12px'
                    >
                      <div className='min-w-0'>
                        <Typography.Text className='block font-600 text-t-primary'>
                          {moduleDisplayLabel(module)}
                        </Typography.Text>
                        <Typography.Text className='block text-12px text-t-secondary break-words'>
                          {modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t)}
                        </Typography.Text>
                        {path ? (
                          <Tooltip content={path}>
                            <Typography.Text className='block text-12px text-t-secondary break-all'>
                              {path}
                            </Typography.Text>
                          </Tooltip>
                        ) : null}
                      </div>
                      <Tag color={isReadyStatus(status) ? 'green' : 'orange'}>{formatStatus(status, t)}</Tag>
                    </div>
                  );
                })}
              </div>
              {modules.length === 0 && (
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('settings.workspacePage.modules.empty')}
                </Typography.Text>
              )}
            </div>
          </Card>
        </div>
      </details>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper contentClassName='max-w-1080px'>{content}</SettingsPageWrapper> : content;
};

export default WorkspaceSettings;
