/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect } from 'react';
import { Button, Message, Modal, Tag, Typography } from '@arco-design/web-react';
import { FileText, FolderOpen, SettingTwo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import OplPersonalizationSettings from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings';
import {
  getAppState,
  oplRecord,
  oplRecordList,
  oplString,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';
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

function configurationItem(appState: Record<string, unknown>, configurationId: string): Record<string, unknown> {
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const configurationCatalog = oplRecord(settingsControlCenter.configuration_catalog);
  return (
    oplRecordList(configurationCatalog.items).find((item) => oplString(item.configuration_id) === configurationId) ?? {}
  );
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
  const workspaceRootConfiguration = configurationItem(appStateQuery.appState, 'workspace_root');
  const workspaceRootActionId = oplString(workspaceRootConfiguration.action_id);
  const workspaceRootVerifyActionId = oplString(workspaceRootConfiguration.verify_action_id);
  const workspaceRootVerifyRef = oplString(workspaceRootConfiguration.verify_ref);
  const workspaceRootPayloadFields = Array.isArray(workspaceRootConfiguration.payload_fields)
    ? workspaceRootConfiguration.payload_fields.filter((field): field is string => typeof field === 'string')
    : [];
  const workspaceRootConfirmationRequired = workspaceRootConfiguration.confirmation_required === true;
  const workspaceRootMutationAvailable = Boolean(
    workspaceRootActionId &&
    typeof workspaceRootConfiguration.confirmation_required === 'boolean' &&
    workspaceRootPayloadFields.includes('path') &&
    (workspaceRootVerifyActionId || workspaceRootVerifyRef)
  );
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const workspaceServices = oplRecord(appSettingsReadModel.workspace_services);
  const paths = oplRecord(appStateQuery.appState.paths);
  const projectedWorkspaceRoot = oplRecord(workspaceServices.workspace_root);
  const workspaceRootRecord =
    Object.keys(projectedWorkspaceRoot).length > 0 ? projectedWorkspaceRoot : oplRecord(paths.workspace_root);
  const projectedFamilyWorkspaceRoot = oplRecord(workspaceServices.family_workspace_root);
  const familyWorkspaceRoot = oplPathString(projectedFamilyWorkspaceRoot) ?? oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(workspaceRootConfiguration.current_value) ??
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

  const applyWorkspaceRoot = useCallback(
    async (selectedPath: string) => {
      if (!workspaceRootActionId) return;
      setWorkspaceAction('choose');
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: workspaceRootActionId,
          dryRun: false,
          payloadRefsOnlyJson: { path: selectedPath },
        });
        if (!bridgeResultSucceeded(result)) {
          message.error(result?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
          return;
        }

        if (workspaceRootVerifyActionId) {
          const verifyResult = await ipcBridge.oplRuntime.executeAction.invoke({
            actionId: workspaceRootVerifyActionId,
            dryRun: false,
            payloadRefsOnlyJson: { workspace_path: selectedPath },
          });
          if (!bridgeResultSucceeded(verifyResult)) {
            message.error(verifyResult?.error?.message || t('settings.oplEnvironmentPage.messages.commandFailed'));
            return;
          }
        }

        const freshPayload = await appStateQuery.load('fast', { showRefreshing: true, forceFresh: true });
        const freshWorkspaceRoot = oplString(
          configurationItem(getAppState(freshPayload), 'workspace_root').current_value
        );
        if (freshWorkspaceRoot !== selectedPath) {
          message.error(t('settings.workspacePage.root.changeNotVerified'));
          return;
        }
        message.success(t('settings.oplEnvironmentPage.messages.workspaceRootSaved'));
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      } finally {
        setWorkspaceAction(null);
      }
    },
    [appStateQuery.load, message, t, workspaceRootActionId, workspaceRootVerifyActionId]
  );

  const chooseWorkspaceRoot = useCallback(async () => {
    if (!workspaceRootMutationAvailable) return;
    setWorkspaceAction('choose');
    try {
      const files = await ipcBridge.dialog.showOpen.invoke({
        defaultPath: workspaceRoot ?? familyWorkspaceRoot ?? undefined,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selectedPath = files?.[0];
      if (!selectedPath) return;
      if (!workspaceRootConfirmationRequired) {
        await applyWorkspaceRoot(selectedPath);
        return;
      }

      Modal.confirm({
        title: t('settings.workspacePage.root.changeConfirmTitle'),
        content: t('settings.workspacePage.root.changeConfirmContent', { path: selectedPath }),
        okText: t('settings.workspacePage.actions.changeWorkspace'),
        cancelText: t('common.cancel'),
        onOk: () => applyWorkspaceRoot(selectedPath),
      });
    } catch {
      message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    } finally {
      setWorkspaceAction(null);
    }
  }, [
    applyWorkspaceRoot,
    familyWorkspaceRoot,
    message,
    t,
    workspaceRoot,
    workspaceRootConfirmationRequired,
    workspaceRootMutationAvailable,
  ]);

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
            className={`opl-settings-section opl-settings-surface--configuration ${
              workspaceNeedsAction ? 'opl-settings-section--attention' : ''
            }`}
            id='current-workspace'
          >
            <span id='work-directory' aria-hidden='true' />
            <span id='permissions' aria-hidden='true' />
            <span id='artifacts' aria-hidden='true' />
            {!workspaceReady && <span data-testid='settings-workspace-exception' aria-hidden='true' />}
            <div className='opl-settings-section__header'>
              <div>
                <Typography.Text className='block font-600 text-t-primary'>
                  {t('settings.workspacePage.locations.title')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.workspacePage.locations.description')}
                </Typography.Text>
              </div>
              <Button
                type='text'
                size='small'
                icon={<SettingTwo theme='outline' size='14' />}
                data-testid='settings-workspace-diagnostics-action'
                onClick={() => (window.location.hash = '#/settings/environment?section=diagnostics')}
              >
                {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
              </Button>
            </div>
            <div className='opl-settings-list'>
              <div className='opl-settings-row' data-testid='opl-workspace-settings-root'>
                <div className='opl-settings-row__main'>
                  <div className='flex min-w-0 items-start gap-10px'>
                    <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                      <FolderOpen theme='outline' size='16' />
                    </span>
                    <div className='min-w-0'>
                      <Typography.Text className='block font-600 text-t-primary'>
                        {t('settings.workspacePage.root.title')}
                      </Typography.Text>
                      <Typography.Text className='opl-settings-path block text-12px text-t-secondary'>
                        {workspaceSummary}
                      </Typography.Text>
                    </div>
                  </div>
                </div>
                <div className='opl-settings-row__meta'>
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
                      disabled={!workspaceRootMutationAvailable}
                      onClick={chooseWorkspaceRoot}
                      data-testid='settings-workspace-primary-action'
                    >
                      {t('settings.workspacePage.actions.changeWorkspace')}
                    </Button>
                  )}
                </div>
              </div>

              <div className='opl-settings-row' id='logs' data-testid='settings-workspace-log-directory'>
                <div className='opl-settings-row__main'>
                  <div className='flex min-w-0 items-start gap-10px'>
                    <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
                      <FileText theme='outline' size='16' />
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
                      <Typography.Text className='opl-settings-path block text-12px text-t-secondary'>
                        {logsRoot
                          ? t('settings.workspacePage.logs.current', { path: logsRoot })
                          : systemDirectoryLoadFailed
                            ? t('settings.workspacePage.logs.unavailable')
                            : t('settings.workspacePage.logs.loading')}
                      </Typography.Text>
                    </div>
                  </div>
                </div>
                <div className='opl-settings-row__meta'>
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
