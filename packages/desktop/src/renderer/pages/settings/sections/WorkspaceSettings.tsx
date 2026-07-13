/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Button, Message, Modal, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import OplPersonalizationSettings from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { isElectronDesktop } from '@/renderer/utils/platform';
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

type SystemDirectoryInfo = {
  cacheDir: string;
  workDir: string;
  logDir: string;
  platform: string;
  arch: string;
};

const WORKSPACE_PERMISSION_ATTENTION_MODES = new Set(['read-only', 'plan']);
const AVAILABLE_WORKSPACE_HEALTH = new Set(['available', 'healthy', 'ok', 'ready']);
const UNKNOWN_WORKSPACE_HEALTH = new Set(['not_reported', 'unknown']);

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result && result.ok !== false && (result.parsed || result.stdout));
}

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const [workspaceAction, setWorkspaceAction] = React.useState<'choose' | null>(null);
  const [logDirectoryAction, setLogDirectoryAction] = React.useState<'choose' | null>(null);
  const [systemDirectories, setSystemDirectories] = React.useState<SystemDirectoryInfo | null>(null);
  const [systemDirectoryLoadFailed, setSystemDirectoryLoadFailed] = React.useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const isDesktop = isElectronDesktop();
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
  const frameworkLogsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const logsRoot = systemDirectories?.logDir ?? null;
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const permissionMode = oplString(executor.permission_mode) ?? oplString(codex.permission_mode) ?? 'unknown';
  const workspaceRootHealth = oplString(workspaceRootRecord.health_status) ?? oplString(workspaceRootRecord.status);
  const workspaceExistsFlag =
    workspaceRootRecord.exists === true ? true : workspaceRootRecord.exists === false ? false : null;
  const workspaceWritableFlag =
    workspaceRootRecord.writable === true ? true : workspaceRootRecord.writable === false ? false : null;

  const modules = useMemo(
    () => moduleRecords(modulesPayload.items ?? modulesPayload.modules).map(normalizeModule),
    [modulesPayload.items, modulesPayload.modules]
  );

  const openFolder = (path: string | null) => {
    if (!path || !isDesktop) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' });
  };

  const loadSystemDirectories = useCallback(async () => {
    try {
      const next = await ipcBridge.application.systemInfo.invoke();
      setSystemDirectories(next);
      setSystemDirectoryLoadFailed(false);
    } catch {
      setSystemDirectories(null);
      setSystemDirectoryLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadSystemDirectories();
  }, [loadSystemDirectories]);

  const workspaceHealthState =
    !workspaceRootHealth || UNKNOWN_WORKSPACE_HEALTH.has(workspaceRootHealth)
      ? 'unknown'
      : AVAILABLE_WORKSPACE_HEALTH.has(workspaceRootHealth)
        ? 'ready'
        : 'needsAction';
  const workspaceExistsState =
    !workspaceRoot || workspaceExistsFlag === false || workspaceRootHealth === 'missing'
      ? 'needsAction'
      : workspaceExistsFlag === true
        ? 'ready'
        : 'unknown';
  const workspaceAccessState =
    !workspaceRoot || workspaceWritableFlag === false || workspaceHealthState === 'needsAction'
      ? 'needsAction'
      : workspaceWritableFlag === true || workspaceHealthState === 'ready'
        ? 'ready'
        : 'unknown';
  const permissionState = !workspaceRoot
    ? 'unknown'
    : workspaceAccessState === 'needsAction' || WORKSPACE_PERMISSION_ATTENTION_MODES.has(permissionMode)
      ? 'needsAction'
      : workspaceAccessState !== 'ready' || permissionMode === 'unknown'
        ? 'unknown'
        : 'ready';
  const workspaceReady =
    workspaceExistsState === 'ready' && workspaceAccessState === 'ready' && permissionState === 'ready';
  const workspaceNeedsAction =
    workspaceExistsState === 'needsAction' ||
    workspaceAccessState === 'needsAction' ||
    permissionState === 'needsAction';
  const workspaceSummary = workspaceRoot
    ? t('settings.workspacePage.root.current', { path: workspaceRoot })
    : t('settings.workspacePage.root.missing');

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

  const chooseLogDirectory = useCallback(async () => {
    if (!isDesktop || !systemDirectories) return;
    setLogDirectoryAction('choose');
    try {
      const files = await ipcBridge.dialog.showOpen.invoke({
        defaultPath: logsRoot ?? systemDirectories.workDir,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selectedPath = files?.[0];
      if (!selectedPath) return;
      await ipcBridge.application.updateSystemInfo.invoke({
        cacheDir: systemDirectories.cacheDir,
        workDir: systemDirectories.workDir,
        logDir: selectedPath,
      });
      setSystemDirectories({ ...systemDirectories, logDir: selectedPath });
      message.success(t('settings.workspacePage.logs.saved'));
    } catch {
      message.error(t('settings.workspacePage.logs.saveFailed'));
    } finally {
      setLogDirectoryAction(null);
    }
  }, [isDesktop, logsRoot, message, systemDirectories, t]);

  const openMaintenance = () => {
    window.location.hash = '#/settings/environment';
  };

  const content = (
    <>
      {messageContextHolder}
      <div className='opl-settings-page' data-testid='settings-page-workspace'>
        <header className='opl-settings-page-header'>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>{t('settings.workspacePage.title')}</Typography.Title>
            <Typography.Text>{t('settings.workspacePage.description')}</Typography.Text>
          </div>
        </header>

        <div className='flex flex-col gap-14px' data-testid='settings-workspace-primary'>
          <section
            className={`opl-settings-section opl-settings-surface--configuration flex ${
              workspaceNeedsAction ? 'opl-settings-section--attention' : ''
            }`}
            id='current-workspace'
            data-testid='opl-workspace-settings-root'
          >
            <span id='work-directory' aria-hidden='true' />
            <span id='permissions' aria-hidden='true' />
            <span id='artifacts' aria-hidden='true' />
            {permissionState !== 'ready' && <span data-testid='settings-workspace-exception' aria-hidden='true' />}
            <div className='flex min-w-0 flex-1 flex-col'>
              <div className='flex min-w-0 flex-col gap-16px p-16px'>
                <div className='flex min-w-0 items-start gap-10px'>
                  <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                    <FolderOpen theme='outline' />
                  </span>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {t('settings.workspacePage.root.title')}
                    </Typography.Text>
                    <Typography.Text className='block break-all text-12px text-t-secondary'>
                      {workspaceSummary}
                    </Typography.Text>
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-8px'>
                  {!isDesktop && <Tag color='gray'>{t('settings.workspacePage.root.dockerMount')}</Tag>}
                  <span
                    className={`opl-settings-status ${
                      workspaceReady
                        ? 'opl-settings-status--ready'
                        : workspaceNeedsAction
                          ? 'opl-settings-status--attention'
                          : ''
                    }`}
                  >
                    {workspaceReady
                      ? t('settings.workspacePage.status.writable')
                      : workspaceNeedsAction
                        ? t('settings.workspacePage.status.needsAction')
                        : t('settings.oplEnvironmentPage.status.unknown')}
                  </span>
                  {isDesktop && (
                    <Button disabled={!workspaceRoot} onClick={() => openFolder(workspaceRoot)}>
                      {t('settings.workspacePage.actions.openWorkspace')}
                    </Button>
                  )}
                  <Button data-testid='settings-workspace-diagnostics-action' onClick={() => setDiagnosticsOpen(true)}>
                    {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
                  </Button>
                  {permissionState !== 'ready' && (
                    <Button onClick={openMaintenance}>{t('settings.workspacePage.actions.openMaintenance')}</Button>
                  )}
                  {isDesktop && (
                    <Button
                      type='primary'
                      loading={workspaceAction === 'choose'}
                      onClick={chooseWorkspaceRoot}
                      data-testid='settings-workspace-primary-action'
                    >
                      {t('settings.workspacePage.actions.changeWorkspace')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section
            className='opl-settings-section opl-settings-surface--configuration flex'
            id='logs'
            data-testid='settings-workspace-log-directory'
          >
            <div className='flex min-w-0 flex-1 flex-col gap-16px p-16px'>
              <div className='flex min-w-0 items-start gap-10px'>
                <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                  <FolderOpen theme='outline' />
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {t('settings.workspacePage.logs.title')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {t(
                      isDesktop
                        ? 'settings.workspacePage.logs.description'
                        : 'settings.workspacePage.logs.webuiDescription'
                    )}
                  </Typography.Text>
                  <Typography.Text className='block break-all text-12px text-t-secondary'>
                    {logsRoot
                      ? t('settings.workspacePage.logs.current', { path: logsRoot })
                      : systemDirectoryLoadFailed
                        ? t('settings.workspacePage.logs.unavailable')
                        : t('settings.workspacePage.logs.loading')}
                  </Typography.Text>
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-8px'>
                {!isDesktop && <Tag color='gray'>{t('settings.workspacePage.logs.dockerMount')}</Tag>}
                <Button disabled={!isDesktop || !logsRoot} onClick={() => openFolder(logsRoot)}>
                  {t('settings.workspacePage.actions.openLogs')}
                </Button>
                {isDesktop && (
                  <Button
                    loading={logDirectoryAction === 'choose'}
                    disabled={!systemDirectories}
                    onClick={() => void chooseLogDirectory()}
                    data-testid='settings-workspace-log-directory-action'
                  >
                    {t('settings.workspacePage.actions.changeLogs')}
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section
            className='flex flex-col gap-10px'
            id='personalization'
            data-testid='settings-workspace-personalization'
          >
            <div>
              <Typography.Title heading={6}>{t('settings.personalization.title')}</Typography.Title>
              <Typography.Text>{t('settings.personalization.description')}</Typography.Text>
            </div>
            <OplPersonalizationSettings />
          </section>
        </div>

        <Modal
          visible={diagnosticsOpen}
          title={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
          footer={null}
          onCancel={() => setDiagnosticsOpen(false)}
          unmountOnExit
        >
          <div
            className='opl-settings-surface--diagnostic'
            id='technical-paths'
            data-testid='settings-workspace-technical-details'
          >
            <Typography.Text className='block pb-10px text-12px text-t-secondary'>
              {t('settings.workspacePage.technical.description')}
            </Typography.Text>
            <div className='opl-settings-technical-group'>
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
                <div className='opl-settings-row' data-testid='opl-workspace-settings-framework-logs'>
                  <div className='opl-settings-row__main'>
                    <Typography.Text className='font-500 text-t-primary'>
                      {t('settings.workspacePage.frameworkLogs.title')}
                    </Typography.Text>
                    <Typography.Text className='break-all text-12px text-t-secondary'>
                      {frameworkLogsRoot
                        ? t('settings.workspacePage.frameworkLogs.current', { path: frameworkLogsRoot })
                        : t('settings.workspacePage.frameworkLogs.missing')}
                    </Typography.Text>
                  </div>
                  <div className='opl-settings-row__meta'>
                    <Button disabled={!isDesktop || !frameworkLogsRoot} onClick={() => openFolder(frameworkLogsRoot)}>
                      {t('settings.workspacePage.actions.openLogs')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div
              className='mt-14px flex flex-col divide-y divide-border-1'
              data-testid='opl-workspace-settings-modules'
            >
              {modules.map((module, index) => {
                const id = moduleId(module) || `module-${index + 1}`;
                const status = moduleStatus(module);
                const path = modulePath(module);
                return (
                  <div
                    key={id}
                    className='flex flex-col gap-6px py-12px md:flex-row md:items-center md:justify-between'
                  >
                    <div className='min-w-0'>
                      <Typography.Text className='block font-500 text-t-primary'>
                        {moduleDisplayLabel(module)}
                      </Typography.Text>
                      <Typography.Text className='block text-12px text-t-secondary'>
                        {modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t)}
                      </Typography.Text>
                      {path ? (
                        <Tooltip content={path}>
                          <Typography.Text className='block break-all text-12px text-t-secondary'>
                            {path}
                          </Typography.Text>
                        </Tooltip>
                      ) : null}
                    </div>
                    <Tag color={isReadyStatus(status) ? 'gray' : 'orange'}>{formatStatus(status, t)}</Tag>
                  </div>
                );
              })}
              {modules.length === 0 && (
                <Typography.Text className='py-12px text-13px text-t-secondary'>
                  {t('settings.workspacePage.modules.empty')}
                </Typography.Text>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default WorkspaceSettings;
