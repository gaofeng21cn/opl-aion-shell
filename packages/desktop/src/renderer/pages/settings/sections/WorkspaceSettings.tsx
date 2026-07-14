/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect } from 'react';
import { Button, Message, Tag, Typography } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import OplPersonalizationSettings from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { isElectronDesktop } from '@/renderer/utils/platform';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { oplPathString } from './runtimeStateView';

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
  const isDesktop = isElectronDesktop();
  const appStateQuery = useOplAppState('fast');
  const settingsControlCenter = oplRecord(appStateQuery.appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const workspaceServices = oplRecord(appSettingsReadModel.workspace_services);
  const paths = oplRecord(appStateQuery.appState.paths);
  const projectedWorkspaceRoot = oplRecord(workspaceServices.workspace_root);
  const workspaceRootRecord =
    Object.keys(projectedWorkspaceRoot).length > 0 ? projectedWorkspaceRoot : oplRecord(paths.workspace_root);
  const projectedFamilyWorkspaceRoot = oplRecord(workspaceServices.family_workspace_root);
  const familyWorkspaceRoot = oplPathString(projectedFamilyWorkspaceRoot) ?? oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplPathString(projectedWorkspaceRoot) ??
    oplString(paths.workspace_root_path) ??
    oplPathString(paths.workspace_root) ??
    familyWorkspaceRoot;
  const workspaceRootHealth = oplString(workspaceRootRecord.health_status) ?? oplString(workspaceRootRecord.status);
  const workspaceExistsFlag =
    workspaceRootRecord.exists === true ? true : workspaceRootRecord.exists === false ? false : null;
  const workspaceWritableFlag =
    workspaceRootRecord.writable === true ? true : workspaceRootRecord.writable === false ? false : null;

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
  const workspaceReady = workspaceExistsState === 'ready' && workspaceAccessState === 'ready';
  const workspaceNeedsAction = workspaceExistsState === 'needsAction' || workspaceAccessState === 'needsAction';
  const workspaceSummary = workspaceRoot
    ? t('settings.workspacePage.root.current', { path: workspaceRoot })
    : t('settings.workspacePage.root.missing');
  const logsRoot = systemDirectories?.logDir ?? null;

  const openFolder = (path: string | null) => {
    if (!path || !isDesktop) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' });
  };

  useEffect(() => {
    let active = true;
    void ipcBridge.application.systemInfo.invoke().then(
      (directories) => {
        if (!active) return;
        setSystemDirectories(directories);
        setSystemDirectoryLoadFailed(false);
      },
      () => {
        if (!active) return;
        setSystemDirectories(null);
        setSystemDirectoryLoadFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, []);

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

      const result = await ipcBridge.application.setLogDirectory.invoke({ path: selectedPath });
      setSystemDirectories({ ...systemDirectories, logDir: result.hostLogDir });
      message.success(t('settings.workspacePage.logs.saved'));
    } catch {
      message.error(t('settings.workspacePage.logs.saveFailed'));
    } finally {
      setLogDirectoryAction(null);
    }
  }, [isDesktop, logsRoot, message, systemDirectories, t]);

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
            {!workspaceReady && <span data-testid='settings-workspace-exception' aria-hidden='true' />}
            <div className='flex min-w-0 flex-1 flex-col gap-16px p-16px'>
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
                {!workspaceReady && (
                  <Button onClick={() => (window.location.hash = '#/settings/environment')}>
                    {t('settings.workspacePage.actions.openMaintenance')}
                  </Button>
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
                {isDesktop && (
                  <Button disabled={!logsRoot} onClick={() => openFolder(logsRoot)}>
                    {t('settings.workspacePage.actions.openLogs')}
                  </Button>
                )}
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
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export default WorkspaceSettings;
