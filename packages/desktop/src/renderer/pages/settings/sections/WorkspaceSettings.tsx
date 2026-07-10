/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import { Button, Message, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplSettingsControlPlaneActionContract } from '@/common/config/oplProductProfile';
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

const SETTINGS_ACTION_CONTRACT = getOplSettingsControlPlaneActionContract();
const WORKSPACE_PERMISSION_ATTENTION_MODES = new Set(['read-only', 'plan']);
const UNAVAILABLE_WORKSPACE_HEALTH = new Set(['blocking', 'missing', 'unavailable']);
const AVAILABLE_WORKSPACE_HEALTH = new Set(['available', 'healthy', 'ok', 'ready']);

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const [workspaceAction, setWorkspaceAction] = React.useState<'choose' | 'repair' | null>(null);
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const paths = oplRecord(appState.paths);
  const workspaceRootRecord = oplRecord(paths.workspace_root);
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
  const workspaceRootHealth = oplString(workspaceRootRecord.health_status) ?? oplString(workspaceRootRecord.status);
  const workspaceExistsFlag =
    workspaceRootRecord.exists === true ? true : workspaceRootRecord.exists === false ? false : null;

  const modules = useMemo(
    () => moduleRecords(modulesPayload.items ?? modulesPayload.modules).map(normalizeModule),
    [modulesPayload.items, modulesPayload.modules]
  );

  const openFolder = (path: string | null) => {
    if (!path) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' });
  };

  const readyModules = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const workspaceExistsState =
    !workspaceRoot || workspaceExistsFlag === false || workspaceRootHealth === 'missing'
      ? 'needsAction'
      : workspaceExistsFlag === true
        ? 'ready'
        : 'unknown';
  const workspaceAccessState =
    !workspaceRoot || Boolean(workspaceRootHealth && UNAVAILABLE_WORKSPACE_HEALTH.has(workspaceRootHealth))
      ? 'needsAction'
      : workspaceExistsFlag === true ||
          Boolean(workspaceRootHealth && AVAILABLE_WORKSPACE_HEALTH.has(workspaceRootHealth))
        ? 'ready'
        : 'unknown';
  const workspaceReady =
    Boolean(workspaceRoot) && workspaceExistsState !== 'needsAction' && workspaceAccessState !== 'needsAction';
  const permissionState = !workspaceRoot
    ? 'unknown'
    : permissionMode === 'unknown'
      ? 'unknown'
      : WORKSPACE_PERMISSION_ATTENTION_MODES.has(permissionMode)
        ? 'needsAction'
        : 'ready';
  const permissionLabel = t(`agentMode.${permissionMode}`, { defaultValue: permissionMode });

  const chooseWorkspaceRoot = useCallback(async () => {
    setWorkspaceAction('choose');
    try {
      const files = await ipcBridge.dialog.showOpen.invoke({
        defaultPath: workspaceRoot ?? familyWorkspaceRoot ?? undefined,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selectedPath = files?.[0];
      if (!selectedPath) return;
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'workspace_root_set',
        dryRun: false,
        payloadRefsOnlyJson: { path: selectedPath },
      });
      if (!bridgeResultSucceeded(result)) {
        message.error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
        return;
      }
      await appStateQuery.load('fast', { showRefreshing: true });
      message.success(t('settings.oplEnvironmentPage.messages.workspaceRootSaved'));
    } catch {
      message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setWorkspaceAction(null);
    }
  }, [appStateQuery.load, familyWorkspaceRoot, message, t, workspaceRoot]);

  const repairWorkspacePermissions = useCallback(async () => {
    setWorkspaceAction('repair');
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: SETTINGS_ACTION_CONTRACT.recommended_action_ids.repair,
        dryRun: false,
      });
      if (!bridgeResultSucceeded(result)) {
        message.error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
        return;
      }
      await appStateQuery.load('fast', { showRefreshing: true });
      message.success(t('settings.oplEnvironmentPage.messages.repairComplete'));
    } catch {
      message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setWorkspaceAction(null);
    }
  }, [appStateQuery.load, message, t]);

  const openMaintenance = () => {
    window.location.hash = '#/settings/environment';
  };

  const content = (
    <>
      {messageContextHolder}
      <div className='opl-settings-page'>
        <header className='opl-settings-page-header'>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>{t('settings.workspacePage.title')}</Typography.Title>
            <Typography.Text>{t('settings.workspacePage.description')}</Typography.Text>
          </div>
        </header>

        <section className='opl-settings-section' id='work-directory' data-testid='opl-workspace-settings-root'>
          <div className='opl-settings-section__header'>
            <div className='flex min-w-0 items-start gap-10px'>
              <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                <FolderOpen theme='outline' />
              </span>
              <div className='min-w-0'>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.workspacePage.root.title')}
                </Typography.Text>
                <Typography.Text className='block break-all text-12px text-t-secondary'>
                  {workspaceRoot
                    ? t('settings.workspacePage.root.current', { path: workspaceRoot })
                    : t('settings.workspacePage.root.missing')}
                </Typography.Text>
              </div>
            </div>
            <span
              className={`opl-settings-status ${workspaceReady ? 'opl-settings-status--ready' : 'opl-settings-status--attention'}`}
            >
              {workspaceReady
                ? t('settings.workspacePage.status.ready')
                : t('settings.workspacePage.status.needsAction')}
            </span>
          </div>
          <div className='opl-settings-list'>
            <div className='opl-settings-row' id='permissions'>
              <div className='opl-settings-row__main'>
                <Typography.Text className='font-500 text-t-primary'>
                  {t('settings.workspacePage.permission.title')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.workspacePage.permission.detail', { mode: permissionLabel })}
                </Typography.Text>
              </div>
              <div className='opl-settings-row__meta'>
                <span
                  className={`opl-settings-status ${
                    permissionState === 'ready'
                      ? 'opl-settings-status--ready'
                      : permissionState === 'needsAction'
                        ? 'opl-settings-status--attention'
                        : ''
                  }`}
                >
                  {t(`settings.workspacePage.permission.${permissionState}`)}
                </span>
                {permissionState === 'needsAction' && (
                  <Button loading={workspaceAction === 'repair'} onClick={repairWorkspacePermissions}>
                    {t('settings.workspacePage.actions.repairPermissions')}
                  </Button>
                )}
              </div>
            </div>
            <div className='opl-settings-row'>
              <div className='opl-settings-row__main'>
                <Typography.Text className='font-500 text-t-primary'>
                  {t('settings.workspacePage.actions.title')}
                </Typography.Text>
                <Typography.Text className='text-12px text-t-secondary'>
                  {workspaceReady
                    ? t('settings.workspacePage.actions.readyDescription')
                    : t('settings.workspacePage.actions.attentionDescription')}
                </Typography.Text>
              </div>
              <div className='opl-settings-row__meta'>
                <Button disabled={!workspaceRoot} onClick={() => openFolder(workspaceRoot)}>
                  {t('settings.workspacePage.actions.openWorkspace')}
                </Button>
                <Button
                  type={!workspaceRoot ? 'primary' : 'secondary'}
                  loading={workspaceAction === 'choose'}
                  onClick={chooseWorkspaceRoot}
                >
                  {t('settings.workspacePage.actions.changeWorkspace')}
                </Button>
                {(permissionState === 'needsAction' || (permissionState === 'unknown' && workspaceRoot)) && (
                  <Button onClick={openMaintenance}>{t('settings.workspacePage.actions.openMaintenance')}</Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <details className='opl-settings-details' id='technical-paths'>
          <summary>{t('settings.workspacePage.technical.title')}</summary>
          <Typography.Text className='block pb-10px text-12px text-t-secondary'>
            {t('settings.workspacePage.technical.description')}
          </Typography.Text>
          <div className='opl-settings-section bg-transparent'>
            <div className='opl-settings-list'>
              <div className='opl-settings-row' data-testid='opl-workspace-settings-modules-root'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.workspacePage.modulesRoot.title')}
                  </Typography.Text>
                  <Typography.Text className='break-all text-12px text-t-secondary'>
                    {modulesRoot
                      ? t('settings.workspacePage.modulesRoot.current', { path: modulesRoot })
                      : t('settings.workspacePage.modulesRoot.missing')}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta'>
                  <Button disabled={!modulesRoot} onClick={() => openFolder(modulesRoot)}>
                    {t('common.open', { defaultValue: 'Open' })}
                  </Button>
                </div>
              </div>
              <div className='opl-settings-row' data-testid='opl-workspace-settings-logs'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.workspacePage.logs.title')}
                  </Typography.Text>
                  <Typography.Text className='break-all text-12px text-t-secondary'>
                    {logsRoot
                      ? t('settings.workspacePage.logs.current', { path: logsRoot })
                      : t('settings.workspacePage.logs.missing')}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta'>
                  <Button disabled={!logsRoot} onClick={() => openFolder(logsRoot)}>
                    {t('settings.workspacePage.actions.openLogs')}
                  </Button>
                </div>
              </div>
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-500 text-t-primary'>
                    {t('settings.workspacePage.cards.lastCheck')}
                  </Typography.Text>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {appStateQuery.loadedAt ?? t('settings.oplEnvironmentPage.status.unknown')}
                  </Typography.Text>
                </div>
                <div className='opl-settings-row__meta'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.workspacePage.modules.description', { ready: readyModules, total: modules.length })}
                  </Typography.Text>
                </div>
              </div>
            </div>
          </div>

          <div className='mt-14px flex flex-col divide-y divide-border-1' data-testid='opl-workspace-settings-modules'>
            {modules.map((module, index) => {
              const id = moduleId(module) || `module-${index + 1}`;
              const status = moduleStatus(module);
              const path = modulePath(module);
              return (
                <div key={id} className='flex flex-col gap-6px py-12px md:flex-row md:items-center md:justify-between'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-500 text-t-primary'>
                      {moduleDisplayLabel(module)}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t)}
                    </Typography.Text>
                    {path ? (
                      <Tooltip content={path}>
                        <Typography.Text className='block break-all text-12px text-t-secondary'>{path}</Typography.Text>
                      </Tooltip>
                    ) : null}
                  </div>
                  <Tag color={isReadyStatus(status) ? 'green' : 'orange'}>{formatStatus(status, t)}</Tag>
                </div>
              );
            })}
            {modules.length === 0 && (
              <Typography.Text className='py-12px text-13px text-t-secondary'>
                {t('settings.workspacePage.modules.empty')}
              </Typography.Text>
            )}
          </div>
        </details>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default WorkspaceSettings;
