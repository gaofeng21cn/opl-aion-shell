/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Button, Card, Message, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, FolderSearch, Repair, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplCodexSessionContext } from '@/common/config/oplProductProfile';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

type RuntimeModuleItem = Record<string, unknown>;

const OPL_MODULE_DISPLAY_LABELS: Record<string, string> = {
  medautoscience: 'Med Auto Science',
  medautogrant: 'Med Auto Grant',
  redcube: 'RedCube AI',
  oplmetaagent: 'OPL Meta Agent',
};

const OPL_RUNTIME_MODULE_IDS = ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent'];

function normalizeStatus(status: string | undefined | null): string | null {
  if (!status) return null;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

function formatStatus(status: string | undefined | null, t: (key: string, options?: Record<string, string>) => string) {
  const normalized = normalizeStatus(status);
  if (!normalized) return t('settings.oplEnvironmentPage.status.unknown');
  return t(`settings.oplEnvironmentPage.status.${normalized}`, { status: normalized });
}

function compactToolDetail(parts: Array<string | null | undefined>, fallback: string) {
  const detail = parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ');
  return detail || fallback;
}

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

function localAppVersion(): string {
  return __OPL_RELEASE_VERSION__ || __APP_VERSION__;
}

function moduleId(module: RuntimeModuleItem): string {
  return (
    oplString(module.module_id) ??
    oplString(module.id) ??
    oplString(module.name)
      ?.replace(/[^a-z0-9]/gi, '')
      .toLowerCase() ??
    ''
  );
}

function normalizeModule(module: RuntimeModuleItem): RuntimeModuleItem {
  const id = moduleId(module);
  return {
    ...module,
    module_id: id,
    label: oplString(module.display_name) ?? oplString(module.label) ?? OPL_MODULE_DISPLAY_LABELS[id] ?? id,
  };
}

function moduleStatus(module: RuntimeModuleItem): string {
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function isReadyStatus(status: string): boolean {
  return status === 'ready' || status === 'compatible' || status === 'ok' || status === 'installed';
}

function modulePath(module: RuntimeModuleItem): string {
  return (
    oplString(module.path) ??
    oplString(module.checkout_path) ??
    oplString(module.managed_checkout_path) ??
    oplString(module.repo_url) ??
    ''
  );
}

function moduleVersionDetail(module: RuntimeModuleItem, t: (key: string, options?: Record<string, string>) => string) {
  const parts = [
    oplString(module.version),
    oplString(module.source),
    oplString(module.install_origin),
    oplString(oplRecord(module.git).short_sha),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(' · ');
  return moduleId(module) || t('settings.oplEnvironmentPage.status.unknown');
}

function modulePathSource(
  module: RuntimeModuleItem,
  familyWorkspaceRoot: string | null,
  modulesSource: string | null,
  t: (key: string, options?: Record<string, string>) => string
) {
  const source = oplString(module.source) ?? oplString(module.install_origin) ?? modulesSource ?? 'unknown';
  const modulePathValue = modulePath(module);
  if (familyWorkspaceRoot && modulePathValue.startsWith(familyWorkspaceRoot)) {
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot', {
      root: familyWorkspaceRoot,
    });
  }
  if (source === 'sibling_workspace')
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace');
  if (source === 'env_override') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.envOverride');
  if (source === 'managed_root') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.managedRoot');
  if (source === 'missing') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.missing');
  if (source === 'invalid_checkout') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.invalidCheckout');
  return t('settings.oplEnvironmentPage.moduleVersion.pathSources.unknown');
}

function formatModuleAction(action: string, t: (key: string, options?: Record<string, string>) => string) {
  return t(`settings.oplEnvironmentPage.moduleActions.${action}`, { action });
}

function bridgeResultSucceeded(result: IOplRuntimeCommandResult | null | undefined): boolean {
  return Boolean(result?.parsed || result?.stdout);
}

const RuntimeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const appStateQuery = useOplAppState('fast');

  React.useEffect(() => {
    messageRef.current = message;
  }, [message]);

  const appState = appStateQuery.appState;
  const core = oplRecord(appState.core);
  const codex = oplRecord(core.codex);
  const defaultProfile = oplRecord(codex.default_profile);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const temporalDetails = oplRecord(temporal.details);
  const temporalWorkerReadiness = oplRecord(temporalDetails.worker_readiness);
  const paths = oplRecord(appState.paths);
  const modulesPayload = oplRecord(appState.modules);
  const modulesSourcePayload = oplRecord(modulesPayload.source);
  const release = oplRecord(appState.release);
  const familyWorkspaceRoot = oplPathString(paths.family_workspace_root);
  const workspaceRoot =
    oplString(paths.workspace_root_path) ?? oplPathString(paths.workspace_root) ?? familyWorkspaceRoot;
  const logsRoot = oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir);
  const modulesSourceMode = oplString(modulesSourcePayload.mode) ?? oplString(modulesPayload.source);
  const modulesSourceReason = oplString(modulesSourcePayload.reason);
  const modulesRoot =
    oplString(modulesSourcePayload.modules_root) ?? oplString(modulesPayload.modules_root) ?? familyWorkspaceRoot;

  const modules = useMemo(() => {
    const byId = new Map(
      oplRecordList(modulesPayload.items ?? modulesPayload.modules).map((item) => {
        const normalized = normalizeModule(item);
        return [moduleId(normalized), normalized];
      })
    );
    return OPL_RUNTIME_MODULE_IDS.map((id) => normalizeModule({ ...byId.get(id), module_id: id }));
  }, [modulesPayload.items, modulesPayload.modules]);

  const moduleReady = modules.filter((module) => isReadyStatus(moduleStatus(module))).length;
  const moduleValue = t('settings.oplEnvironmentPage.modulesReadyCount', {
    ready: moduleReady,
    total: modules.length,
  });
  const codexStatus = oplString(codex.status) ?? (oplString(codex.version) ? 'ready' : 'unknown');
  const temporalStatus =
    oplString(temporal.health_status) ?? oplString(temporal.status) ?? oplString(temporal.worker_status) ?? 'unknown';
  const workspaceStatus = workspaceRoot ? 'ready' : 'unknown';
  const appVersion = localAppVersion();
  const guiVersion = __SHELL_VERSION__;
  const releaseChannel = oplString(release.channel) ?? oplString(release.release_channel) ?? 'stable';
  const releaseRepo = oplString(release.repo) ?? oplString(release.release_repo);
  const latestStableVersion = oplString(release.app_version) ?? oplString(release.version);
  const runtimeCards = useMemo(
    () => [
      {
        key: 'codex',
        title: 'Codex CLI',
        value: formatStatus(codexStatus, t),
        detail: compactToolDetail(
          [
            oplString(codex.version),
            oplString(codex.binary_path),
            oplString(codex.default_model) ?? oplString(defaultProfile.model),
            oplString(codex.default_reasoning_effort) ?? oplString(defaultProfile.model_reasoning_effort),
            oplString(oplRecord(core.executor).permission_mode),
          ],
          t('settings.oplEnvironmentPage.status.unknown')
        ),
        tone: codexStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'temporal',
        title: 'Temporal',
        value: formatStatus(temporalStatus, t),
        detail: compactToolDetail(
          [
            oplString(temporal.version),
            oplString(temporalDetails.address),
            oplString(temporalDetails.namespace),
            oplString(temporalDetails.task_queue),
            oplString(temporalWorkerReadiness.readiness_status),
          ],
          t('settings.oplEnvironmentPage.status.unknown')
        ),
        tone: temporalStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'workspace',
        title: t('settings.oplEnvironmentPage.workspaceRootTitle'),
        value: formatStatus(workspaceStatus, t),
        detail: workspaceRoot || t('settings.oplEnvironmentPage.workspaceRootMissing'),
        tone: workspaceStatus === 'ready' ? 'green' : 'orange',
      },
      {
        key: 'modules',
        title: t('settings.oplEnvironmentPage.modulesTitle'),
        value: moduleValue,
        detail: modulesSourceReason
          ? `${modulesSourceMode ?? t('settings.oplEnvironmentPage.status.unknown')} · ${modulesSourceReason}`
          : modulesSourceMode || t('settings.oplEnvironmentPage.items.module.latest'),
        tone: moduleReady >= modules.length ? 'green' : 'orange',
      },
    ],
    [
      codex,
      codexStatus,
      core.executor,
      defaultProfile,
      moduleReady,
      moduleValue,
      modules.length,
      modulesSourceMode,
      modulesSourceReason,
      t,
      temporal,
      temporalDetails,
      temporalStatus,
      temporalWorkerReadiness,
      workspaceRoot,
      workspaceStatus,
    ]
  );

  const refreshRuntime = useCallback(() => {
    void appStateQuery.load('fast', { showRefreshing: true }).then((payload) => {
      if (payload) messageRef.current.success(t('common.refreshSuccess'));
      else messageRef.current.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
    });
  }, [appStateQuery.load, t]);

  const runOplCommand = useCallback(
    async (args: string[], actionId: string, successText: string) => {
      try {
        const result =
          actionId === 'doctor'
            ? await ipcBridge.oplRuntime.getInitialize.invoke()
            : await ipcBridge.oplRuntime.runInstallPrep.invoke();
        if (bridgeResultSucceeded(result)) {
          message.success(successText);
          await appStateQuery.load('fast', { showRefreshing: true });
        } else {
          message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
        }
      } catch {
        message.error(t('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    },
    [appStateQuery.load, message, t]
  );

  const openLogDir = useCallback(() => {
    if (!logsRoot) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: logsRoot, tool: 'explorer' });
  }, [logsRoot]);

  const openUpdateModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'settings-runtime' } }));
  }, []);

  const codexSessionContext = useMemo(() => getOplCodexSessionContext(), []);

  return (
    <SettingsPageWrapper contentClassName='max-w-1080px'>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.runtimePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.runtimePage.description')}</Typography.Text>
        </div>

        <Card bordered className='rd-8px'>
          <Space wrap>
            <Button
              key='runtime-action-doctor'
              type='primary'
              icon={<CheckOne theme='outline' />}
              onClick={() =>
                void runOplCommand(['doctor'], 'doctor', t('settings.oplEnvironmentPage.messages.doctorComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.doctor')}
            </Button>
            <Button
              key='runtime-action-refresh'
              icon={<UpdateRotation theme='outline' />}
              loading={appStateQuery.refreshing}
              onClick={refreshRuntime}
            >
              {t('settings.oplEnvironmentPage.actions.refresh')}
            </Button>
            <Button
              key='runtime-action-repair'
              icon={<Repair theme='outline' />}
              onClick={() =>
                void runOplCommand(['install'], 'repair', t('settings.oplEnvironmentPage.messages.repairComplete'))
              }
            >
              {t('settings.oplEnvironmentPage.actions.repair')}
            </Button>
          </Space>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('common.version')}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('settings.runtimePage.versionDetail', {
                  oplVersion: appVersion,
                  guiVersion,
                  channel: formatReleaseChannel(releaseChannel, t),
                })}
              </Typography.Text>
              {latestStableVersion && latestStableVersion !== appVersion ? (
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {t('settings.runtimePage.latestStableDetail', { version: latestStableVersion })}
                </Typography.Text>
              ) : null}
              {releaseRepo && (
                <Typography.Text className='block text-12px text-t-secondary break-words'>
                  {releaseRepo}
                </Typography.Text>
              )}
            </div>
            <Button icon={<UpdateRotation theme='outline' />} onClick={openUpdateModal}>
              {t('settings.checkForUpdates')}
            </Button>
          </div>
        </Card>

        <div className='grid grid-cols-1 md:grid-cols-4 gap-14px'>
          {runtimeCards.map((card) => (
            <Card key={`runtime-card-${card.key}`} bordered className='rd-8px'>
              <div className='flex flex-col gap-8px min-w-0'>
                <Typography.Text className='font-600 text-t-primary'>{card.title}</Typography.Text>
                <Tag color={card.tone}>{card.value}</Tag>
                <Typography.Text className='text-12px text-t-secondary break-words'>{card.detail}</Typography.Text>
              </div>
            </Card>
          ))}
        </div>

        <Card bordered className='rd-8px' id='workspace'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('settings.workDir')}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-all'>
                {workspaceRoot || t('settings.dirNotConfigured')}
              </Typography.Text>
            </div>
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-12px md:flex-row md:items-center md:justify-between'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>{t('settings.logDir')}</Typography.Text>
              <Tooltip content={logsRoot || ''}>
                <Typography.Text className='block text-12px text-t-secondary break-all'>
                  {logsRoot || t('settings.dirNotConfigured')}
                </Typography.Text>
              </Tooltip>
            </div>
            <Button icon={<FolderSearch theme='outline' />} disabled={!logsRoot} onClick={openLogDir}>
              {t('common.open', { defaultValue: 'Open' })}
            </Button>
          </div>
        </Card>

        <Card bordered className='rd-8px overflow-hidden' id='modules'>
          <Alert type='info' content={t('settings.oplEnvironmentPage.moduleVersion.scopeDescription')} />
          {modulesRoot ? (
            <Typography.Text className='block text-12px text-t-secondary break-all px-0 pt-12px'>
              {t('settings.oplEnvironmentPage.moduleVersion.modulesRoot', { path: modulesRoot })}
            </Typography.Text>
          ) : null}
          <div className='flex flex-col divide-y divide-border-1'>
            {modules.map((module, moduleIndex) => {
              const status = moduleStatus(module);
              const pathValue = modulePath(module);
              const id = moduleId(module) || `module-${moduleIndex + 1}`;
              return (
                <div key={`runtime-module-${id}`} className='flex items-center justify-between gap-12px py-12px'>
                  <div className='min-w-0'>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {oplString(module.label) ?? id}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {moduleVersionDetail(module, t)}
                    </Typography.Text>
                    {pathValue ? (
                      <Tooltip content={pathValue}>
                        <Typography.Text className='block text-12px text-t-secondary break-all'>
                          {t('settings.oplEnvironmentPage.moduleVersion.checkoutPath', { path: pathValue })}
                        </Typography.Text>
                      </Tooltip>
                    ) : null}
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('settings.oplEnvironmentPage.moduleVersion.pathSource', {
                        source: modulePathSource(module, familyWorkspaceRoot, modulesSourceMode, t),
                      })}
                    </Typography.Text>
                    {oplString(module.repo_url) ? (
                      <Typography.Text className='block text-12px text-t-secondary break-all'>
                        {t('settings.oplEnvironmentPage.moduleVersion.repoUrl', {
                          url: oplString(module.repo_url) ?? '',
                        })}
                      </Typography.Text>
                    ) : null}
                  </div>
                  <Space wrap size='mini'>
                    {oplString(module.recommended_action) && (
                      <Tag key={`${id}-action`} color='orange'>
                        {formatModuleAction(oplString(module.recommended_action) ?? '', t)}
                      </Tag>
                    )}
                    <Tag key={`${id}-status`} color={isReadyStatus(status) ? 'green' : 'orange'}>
                      {formatStatus(status, t)}
                    </Tag>
                  </Space>
                </div>
              );
            })}
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex flex-col gap-8px'>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.oplEnvironmentPage.codexContext.title')}
            </Typography.Text>
            <Typography.Text className='text-12px text-t-secondary'>
              {t('settings.oplEnvironmentPage.codexContext.description')}
            </Typography.Text>
            <pre className='m-0 p-12px rd-8px bg-fill-2 text-12px text-t-primary whitespace-pre-wrap break-words max-h-280px overflow-auto'>
              {codexSessionContext}
            </pre>
          </div>
        </Card>
      </div>
    </SettingsPageWrapper>
  );
};

export default RuntimeSettings;
