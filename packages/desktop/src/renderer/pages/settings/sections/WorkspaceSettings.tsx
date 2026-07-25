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
import { hasDockerDeploymentDirectoryEvidence, oplPathString } from './runtimeStateView';

type WorkspaceSettingsProps = {
  withWrapper?: boolean;
  surface?: 'workspace' | 'instructions' | 'logs';
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

function useSystemDirectories(enabled: boolean): {
  systemDirectories: SystemDirectoryInfo | null;
  systemDirectoryLoadFailed: boolean;
  setSystemDirectories: React.Dispatch<React.SetStateAction<SystemDirectoryInfo | null>>;
} {
  const [systemDirectories, setSystemDirectories] = React.useState<SystemDirectoryInfo | null>(null);
  const [systemDirectoryLoadFailed, setSystemDirectoryLoadFailed] = React.useState(false);

  useEffect(() => {
    if (!enabled) {
      setSystemDirectories(null);
      setSystemDirectoryLoadFailed(false);
      return undefined;
    }
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
  }, [enabled]);

  return { systemDirectories, systemDirectoryLoadFailed, setSystemDirectories };
}

export const LogDirectorySettingsRow: React.FC = () => {
  const { t } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const [logDirectoryAction, setLogDirectoryAction] = React.useState<'choose' | null>(null);
  const isDesktop = isElectronDesktop();
  const { systemDirectories, systemDirectoryLoadFailed, setSystemDirectories } = useSystemDirectories(true);
  const logsRoot = systemDirectories?.logDir ?? null;
  const isDockerLogs = !isDesktop && hasDockerDeploymentDirectoryEvidence(systemDirectories);
  const logDescriptionKey = isDesktop
    ? 'settings.workspacePage.logs.description'
    : isDockerLogs
      ? 'settings.workspacePage.logs.dockerDescription'
      : 'settings.workspacePage.logs.webuiDescription';

  const openLogs = useCallback(() => {
    if (!logsRoot || !isDesktop) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [isDesktop, logsRoot]);

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
  }, [isDesktop, logsRoot, message, setSystemDirectories, systemDirectories, t]);

  return (
    <>
      {messageContextHolder}
      <div className='opl-settings-row' data-testid='settings-workspace-log-directory'>
        <div className='opl-settings-row__main'>
          <div className='flex min-w-0 items-start gap-10px'>
            <span className='mt-1px flex size-24px shrink-0 items-center justify-center text-t-secondary'>
              <FileText theme='outline' size='16' />
            </span>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.workspacePage.logs.title')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary'>{t(logDescriptionKey)}</Typography.Text>
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
          {!isDesktop && (
            <Tag color='gray'>
              {t(
                isDockerLogs ? 'settings.workspacePage.logs.dockerMount' : 'settings.workspacePage.logs.webuiManagedTag'
              )}
            </Tag>
          )}
          {isDesktop && (
            <Button disabled={!logsRoot} onClick={openLogs}>
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
    </>
  );
};

function workspaceSurfaceFromHash(): NonNullable<WorkspaceSettingsProps['surface']> {
  if (typeof window === 'undefined') return 'workspace';
  const query = window.location.hash.split('?', 2)[1] ?? '';
  const section = new URLSearchParams(query).get('section');
  if (
    section === 'personalization' ||
    section === 'system-agents' ||
    section === 'additional-instructions' ||
    section === 'opl-app-context'
  ) {
    return 'instructions';
  }
  if (section === 'logs') return 'logs';
  return 'workspace';
}

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ withWrapper = true, surface }) => {
  const { t } = useTranslation();
  const [message, messageContextHolder] = Message.useMessage();
  const [workspaceAction, setWorkspaceAction] = React.useState<'choose' | null>(null);
  const isDesktop = isElectronDesktop();
  const appStateQuery = useOplAppState('fast');
  const activeSurface = surface ?? (withWrapper ? workspaceSurfaceFromHash() : 'workspace');
  const { systemDirectories: deploymentDirectories } = useSystemDirectories(
    !isDesktop && activeSurface === 'workspace'
  );
  const settingsControlCenter = oplRecord(appStateQuery.appState.settings_control_center);
  const workspaceRootConfiguration = configurationItem(appStateQuery.appState, 'workspace_root');
  const workspaceRootActionId = oplString(workspaceRootConfiguration.action_id);
  const workspaceRootVerifyActionId = oplString(workspaceRootConfiguration.verify_action_id);
  const workspaceRootVerifyRef = oplString(workspaceRootConfiguration.verify_ref);
  const workspaceRootPayloadFields = Array.isArray(workspaceRootConfiguration.payload_fields)
    ? workspaceRootConfiguration.payload_fields.filter((field): field is string => typeof field === 'string')
    : [];
  const workspaceRootConfirmationRequired = workspaceRootConfiguration.confirmation_required === true;
  const workspaceRootMutationAvailable =
    isDesktop &&
    Boolean(
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
  const isDockerWorkspace =
    !isDesktop &&
    workspaceRoot?.replace(/\/+$/, '') === '/projects' &&
    hasDockerDeploymentDirectoryEvidence(deploymentDirectories);
  const workspaceSummary = workspaceRoot
    ? isDesktop
      ? t('settings.workspacePage.root.current', { path: workspaceRoot })
      : t(
          isDockerWorkspace ? 'settings.workspacePage.root.webuiManaged' : 'settings.workspacePage.root.webuiReadOnly',
          { path: workspaceRoot }
        )
    : t(isDesktop ? 'settings.workspacePage.root.missing' : 'settings.workspacePage.root.unavailable');
  const openFolder = (path: string | null) => {
    if (!path || !isDesktop) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' });
  };

  const applyWorkspaceRoot = useCallback(
    async (selectedPath: string) => {
      if (!isDesktop || !workspaceRootActionId) return;
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
    [appStateQuery.load, isDesktop, message, t, workspaceRootActionId, workspaceRootVerifyActionId]
  );

  const chooseWorkspaceRoot = useCallback(async () => {
    if (!isDesktop || !workspaceRootMutationAvailable) return;
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
    isDesktop,
    message,
    t,
    workspaceRoot,
    workspaceRootConfirmationRequired,
    workspaceRootMutationAvailable,
  ]);

  const content = (
    <>
      {messageContextHolder}
      <div className='opl-settings-page' data-testid='settings-page-workspace'>
        <header className='opl-settings-page-header'>
          <div className='opl-settings-page-header__copy'>
            <Typography.Title heading={4}>
              {activeSurface === 'instructions'
                ? t('settings.uiOptimization.navigation.destinations.instructionsContext')
                : activeSurface === 'logs'
                  ? t('settings.uiOptimization.navigation.destinations.logsDiagnostics')
                  : t('settings.uiOptimization.navigation.destinations.workingDirectory')}
            </Typography.Title>
            <Typography.Text>
              {activeSurface === 'instructions'
                ? t('settings.personalization.pageDescription')
                : activeSurface === 'logs'
                  ? t(
                      isDesktop
                        ? 'settings.workspacePage.logs.description'
                        : 'settings.workspacePage.logs.webuiDescription'
                    )
                  : t(
                      workspaceNeedsAction
                        ? 'settings.workspacePage.actions.attentionDescription'
                        : 'settings.workspacePage.actions.readyDescription'
                    )}
            </Typography.Text>
          </div>
        </header>

        <div className='flex flex-col gap-14px' data-testid='settings-workspace-primary'>
          {activeSurface !== 'instructions' ? (
            <section
              className={`opl-settings-section opl-settings-surface--configuration ${
                activeSurface === 'workspace' && workspaceNeedsAction ? 'opl-settings-section--attention' : ''
              }`}
              id={activeSurface === 'logs' ? 'logs' : 'current-workspace'}
            >
              {activeSurface === 'workspace' ? (
                <>
                  <span id='work-directory' aria-hidden='true' />
                  <span id='permissions' aria-hidden='true' />
                  <span id='artifacts' aria-hidden='true' />
                  {!workspaceReady ? <span data-testid='settings-workspace-exception' aria-hidden='true' /> : null}
                </>
              ) : null}
              <div className='opl-settings-section__header'>
                <div>
                  <Typography.Text className='block font-600 text-t-primary'>
                    {activeSurface === 'logs'
                      ? t('settings.workspacePage.logs.title')
                      : t('settings.workspacePage.locations.title')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary'>
                    {activeSurface === 'logs'
                      ? t(
                          isDesktop
                            ? 'settings.workspacePage.logs.description'
                            : 'settings.workspacePage.logs.webuiDescription'
                        )
                      : t('settings.workspacePage.locations.description')}
                  </Typography.Text>
                </div>
                {activeSurface === 'workspace' ? (
                  <Button
                    type='text'
                    size='small'
                    icon={<SettingTwo theme='outline' size='14' />}
                    data-testid='settings-workspace-diagnostics-action'
                    onClick={() => (window.location.hash = '#/settings/environment?section=diagnostics')}
                  >
                    {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
                  </Button>
                ) : null}
              </div>
              <div className='opl-settings-list'>
                {activeSurface === 'workspace' ? (
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
                      {!isDesktop && (
                        <Tag color='gray'>
                          {t(
                            isDockerWorkspace
                              ? 'settings.workspacePage.root.dockerMount'
                              : 'settings.workspacePage.root.webuiManagedTag'
                          )}
                        </Tag>
                      )}
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
                        <Button onClick={() => (window.location.hash = '#/settings/environment?section=services')}>
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
                ) : null}

                {activeSurface === 'logs' ? <LogDirectorySettingsRow /> : null}
              </div>
            </section>
          ) : null}

          {activeSurface === 'instructions' ? (
            <section
              className='flex flex-col gap-10px'
              id='personalization'
              data-testid='settings-workspace-personalization'
            >
              <OplPersonalizationSettings />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );

  return withWrapper ? <SettingsPageWrapper>{content}</SettingsPageWrapper> : content;
};

export const InstructionsContextSettingsContent: React.FC = () => (
  <WorkspaceSettings withWrapper={false} surface='instructions' />
);

export const LogDirectorySettingsContent: React.FC = () => <WorkspaceSettings withWrapper={false} surface='logs' />;

export default WorkspaceSettings;
