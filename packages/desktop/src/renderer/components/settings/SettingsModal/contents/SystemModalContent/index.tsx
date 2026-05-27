/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IGpuStatus, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import {
  oplRecord,
  oplString,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Collapse, Form, InputNumber, Message, Modal, Switch, Tooltip } from '@arco-design/web-react';
import { FolderSearch } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../../settingsViewContext';
import DevSettings from './DevSettings';
import DirInputItem from './DirInputItem';
import PreferenceRow from './PreferenceRow';

const DEVELOPER_MODE_STATUS_TIMEOUT_MS = 8_000;
const DEVELOPER_MODE_CACHE_KEY = 'opl.developerModeState.v1';

type DeveloperModeEnabled = 'auto' | 'on' | 'off';

type DeveloperModeSwitchState = {
  known: boolean;
  enabled: DeveloperModeEnabled;
  mode?: string;
  status?: string;
  effectiveState?: string;
  allowedRoute?: string;
  githubLogin?: string | null;
  configSource?: string;
  switching: boolean;
};

type PreferenceItem = {
  key: string;
  label: string;
  component: React.ReactNode;
  description?: string;
  testId?: string;
};

const DEFAULT_DEVELOPER_MODE_STATE: DeveloperModeSwitchState = {
  known: true,
  enabled: 'off',
  status: 'disabled',
  effectiveState: 'disabled',
  allowedRoute: 'disabled',
  switching: false,
};

function readCachedDeveloperModeSwitchState(): DeveloperModeSwitchState | null {
  try {
    const raw = localStorage.getItem(DEVELOPER_MODE_CACHE_KEY);
    if (!raw) return null;
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed) return null;
    return {
      known: parsed.known === true,
      enabled: normalizeDeveloperModeEnabled(parsed.enabled),
      mode: typeof parsed.mode === 'string' ? parsed.mode : undefined,
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      effectiveState: typeof parsed.effectiveState === 'string' ? parsed.effectiveState : undefined,
      allowedRoute: typeof parsed.allowedRoute === 'string' ? parsed.allowedRoute : undefined,
      githubLogin: typeof parsed.githubLogin === 'string' ? parsed.githubLogin : null,
      configSource: typeof parsed.configSource === 'string' ? parsed.configSource : undefined,
      switching: false,
    };
  } catch {
    return null;
  }
}

function writeCachedDeveloperModeSwitchState(state: DeveloperModeSwitchState): void {
  if (!state.known) return;
  try {
    localStorage.setItem(
      DEVELOPER_MODE_CACHE_KEY,
      JSON.stringify({
        known: true,
        enabled: state.enabled,
        mode: state.mode,
        status: state.status,
        effectiveState: state.effectiveState,
        allowedRoute: state.allowedRoute,
        githubLogin: state.githubLogin ?? null,
        configSource: state.configSource,
      })
    );
  } catch {
    // Ignore storage failures; the live OPL command remains authoritative.
  }
}

function normalizeDeveloperModeSnapshot(snapshot: unknown): DeveloperModeSwitchState | null {
  const parsed = asRecord(snapshot);
  if (!parsed || parsed.known !== true) return null;
  return {
    known: true,
    enabled: normalizeDeveloperModeEnabled(parsed.enabled),
    mode: typeof parsed.mode === 'string' ? parsed.mode : undefined,
    status: typeof parsed.status === 'string' ? parsed.status : undefined,
    effectiveState: typeof parsed.effectiveState === 'string' ? parsed.effectiveState : undefined,
    allowedRoute: typeof parsed.allowedRoute === 'string' ? parsed.allowedRoute : undefined,
    githubLogin: typeof parsed.githubLogin === 'string' ? parsed.githubLogin : null,
    configSource: typeof parsed.configSource === 'string' ? parsed.configSource : undefined,
    switching: false,
  };
}

function normalizeDeveloperModeFromAppState(appState: Record<string, unknown>): DeveloperModeSwitchState | null {
  const developerMode = oplRecord(appState.developer_mode);
  if (Object.keys(developerMode).length === 0) return null;
  const githubIdentity = oplRecord(developerMode.github_identity);
  return {
    known: true,
    enabled: normalizeDeveloperModeEnabled(developerMode.enabled),
    mode: oplString(developerMode.mode) ?? undefined,
    status: oplString(developerMode.status) ?? undefined,
    effectiveState: oplString(developerMode.effective_state) ?? oplString(developerMode.effectiveState) ?? undefined,
    allowedRoute: oplString(developerMode.allowed_route) ?? oplString(developerMode.allowedRoute) ?? undefined,
    githubLogin: oplString(githubIdentity.login),
    configSource: oplString(developerMode.config_source) ?? oplString(developerMode.configSource) ?? undefined,
    switching: false,
  };
}

function readDeveloperModeStatusTimeoutMs(): number {
  const override = (globalThis as typeof globalThis & { __OPL_DEVELOPER_MODE_STATUS_TIMEOUT_MS__?: number | string })
    .__OPL_DEVELOPER_MODE_STATUS_TIMEOUT_MS__;
  const parsed = Number(override ?? DEVELOPER_MODE_STATUS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEVELOPER_MODE_STATUS_TIMEOUT_MS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeDeveloperModeEnabled(value: unknown): DeveloperModeEnabled {
  return value === 'auto' || value === 'on' || value === 'off' ? value : 'off';
}

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

function parseDeveloperModeSwitchState(stdout: string): DeveloperModeSwitchState | null {
  try {
    const payload = asRecord(JSON.parse(stdout));
    const execution = asRecord(payload?.app_action_execution);
    const result = asRecord(execution?.result);
    const systemAction = asRecord(payload?.system_action) ?? asRecord(result?.system_action);
    const supervisor = asRecord(systemAction?.developer_supervisor);
    const developerMode = asRecord(systemAction?.developer_mode);
    const requested = asRecord(systemAction?.requested);
    if (!supervisor && !developerMode && !requested) return null;

    const githubIdentity = asRecord(developerMode?.github_identity);
    return {
      known: true,
      enabled: normalizeDeveloperModeEnabled(
        supervisor?.enabled ?? developerMode?.enabled ?? requested?.developerSupervisorEnabled
      ),
      mode:
        typeof supervisor?.mode === 'string'
          ? supervisor.mode
          : typeof developerMode?.mode === 'string'
            ? developerMode.mode
            : typeof requested?.developerSupervisorMode === 'string'
              ? requested.developerSupervisorMode
              : undefined,
      status:
        typeof developerMode?.status === 'string'
          ? developerMode.status
          : typeof systemAction?.status === 'string'
            ? systemAction.status
            : undefined,
      effectiveState: typeof developerMode?.effective_state === 'string' ? developerMode.effective_state : undefined,
      allowedRoute: typeof developerMode?.allowed_route === 'string' ? developerMode.allowed_route : undefined,
      githubLogin: typeof githubIdentity?.login === 'string' ? githubIdentity.login : null,
      configSource:
        typeof supervisor?.source === 'string'
          ? supervisor.source
          : typeof developerMode?.config_source === 'string'
            ? developerMode.config_source
            : undefined,
      switching: false,
    };
  } catch {
    return null;
  }
}

function getDeveloperModeDescriptionKey(developerMode: DeveloperModeSwitchState): string {
  if (!developerMode.known) return 'settings.developerModeStateLoading';
  if (developerMode.enabled === 'off') return 'settings.developerModeStateOff';
  if (developerMode.enabled === 'auto') return 'settings.developerModeStateAuto';

  const blocked =
    developerMode.status === 'blocked' ||
    developerMode.effectiveState === 'blocked' ||
    developerMode.allowedRoute === 'blocked';
  return blocked ? 'settings.developerModeStateOnLimited' : 'settings.developerModeStateOnReady';
}

function withDeveloperModeTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('OPL Developer Mode status timed out.'));
    }, readDeveloperModeStatusTimeoutMs());
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * System settings content component
 *
 * Provides system-level configuration options including language, directory config,
 * and developer tools (dev mode only).
 */
const SystemModalContent: React.FC = () => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [form] = Form.useForm();
  const [modal, modalContextHolder] = Modal.useModal();
  const [message, messageContextHolder] = Message.useMessage();
  const [error, setError] = useState<string | null>(null);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const initializingRef = useRef(true);
  const appStateQuery = useOplAppState('fast');

  const [startOnBoot, setStartOnBoot] = useState<IStartOnBootStatus>({
    supported: false,
    enabled: false,
    isPackaged: false,
    platform: 'web',
  });
  const [closeToTray, setCloseToTray] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<IGpuStatus | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);
  const [promptTimeout, setPromptTimeout] = useState<number>(300);
  const [agentIdleTimeout, setAgentIdleTimeout] = useState<number>(5);
  const [saveUploadToWorkspace, setSaveUploadToWorkspace] = useState(false);
  const [autoPreviewOfficeFiles, setAutoPreviewOfficeFiles] = useState(true);
  const [developerMode, setDeveloperMode] = useState<DeveloperModeSwitchState>(
    () => readCachedDeveloperModeSwitchState() ?? DEFAULT_DEVELOPER_MODE_STATE
  );

  const developerModeDescription = t(getDeveloperModeDescriptionKey(developerMode));

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    ipcBridge.application.getStartOnBootStatus
      .invoke()
      .then((result) => {
        if (result.success && result.data) {
          setStartOnBoot(result.data);
        }
      })
      .catch(() => {});

    ipcBridge.application.getGpuStatus
      .invoke()
      .then((result) => {
        if (result.success && result.data) {
          setGpuStatus(result.data);
        }
      })
      .catch(() => {});
  }, [isDesktop]);

  useEffect(() => {
    setCloseToTray(configService.get('system.closeToTray') ?? false);
    setNotificationEnabled(configService.get('system.notificationEnabled') ?? true);
    setCronNotificationEnabled(configService.get('system.cronNotificationEnabled') ?? false);
    setSaveUploadToWorkspace(configService.get('upload.saveToWorkspace') ?? false);
    setAutoPreviewOfficeFiles(configService.get('system.autoPreviewOfficeFiles') ?? true);
    const pt = configService.get('acp.promptTimeout');
    if (pt && pt > 0) setPromptTimeout(pt);
    const ait = configService.get('acp.agentIdleTimeout');
    if (ait && ait > 0) setAgentIdleTimeout(ait);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const parsed = normalizeDeveloperModeFromAppState(appStateQuery.appState);
    if (parsed) {
      writeCachedDeveloperModeSwitchState(parsed);
      setDeveloperMode(parsed);
    } else if (!appStateQuery.loading && !cancelled) {
      setDeveloperMode((current) => (current.known ? current : DEFAULT_DEVELOPER_MODE_STATE));
    }

    return () => {
      cancelled = true;
    };
  }, [appStateQuery.appState, appStateQuery.loading]);

  const handleCloseToTrayChange = useCallback((checked: boolean) => {
    setCloseToTray(checked);
    configService.setLocal('system.closeToTray', checked);
    ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked }).catch(() => {
      setCloseToTray(!checked);
      configService.setLocal('system.closeToTray', !checked);
    });
  }, []);

  const handleHardwareAccelerationChange = useCallback(
    (checked: boolean) => {
      const previous = gpuStatus;
      const optimistic: IGpuStatus = {
        userOverride: checked ? 'force-on' : 'force-off',
        autoDisabled: false,
        crashCount: 0,
        lastCrashAt: gpuStatus?.lastCrashAt ?? null,
      };
      setGpuStatus(optimistic);

      const apply = () => {
        ipcBridge.application.setGpuOverride
          .invoke({ override: checked ? 'force-on' : 'force-off' })
          .then((result) => {
            if (result.success && result.data) {
              setGpuStatus(result.data);
              ipcBridge.application.restart.invoke().catch(() => {});
            } else {
              setGpuStatus(previous);
              Message.error(t('settings.hardwareAccelerationUpdateFailed'));
            }
          })
          .catch(() => {
            setGpuStatus(previous);
            Message.error(t('settings.hardwareAccelerationUpdateFailed'));
          });
      };

      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.hardwareAccelerationRestartConfirm'),
        onOk: apply,
        onCancel: () => setGpuStatus(previous),
      });
    },
    [gpuStatus, modal, t]
  );

  const handleStartOnBootChange = useCallback(
    (checked: boolean) => {
      const previousStatus = startOnBoot;
      setStartOnBoot((prev) => ({ ...prev, enabled: checked }));

      ipcBridge.application.setStartOnBoot
        .invoke({ enabled: checked })
        .then((result) => {
          if (result.success && result.data) {
            setStartOnBoot(result.data);
            return;
          }

          setStartOnBoot(previousStatus);
          Message.error(result.msg || t('settings.startOnBootUpdateFailed'));
        })
        .catch(() => {
          setStartOnBoot(previousStatus);
          Message.error(t('settings.startOnBootUpdateFailed'));
        });
    },
    [startOnBoot, t]
  );

  const handleNotificationEnabledChange = useCallback((checked: boolean) => {
    setNotificationEnabled(checked);
    configService.set('system.notificationEnabled', checked).catch(() => {
      setNotificationEnabled(!checked);
      configService.setLocal('system.notificationEnabled', !checked);
    });
  }, []);

  const handleCronNotificationEnabledChange = useCallback((checked: boolean) => {
    setCronNotificationEnabled(checked);
    configService.set('system.cronNotificationEnabled', checked).catch(() => {
      setCronNotificationEnabled(!checked);
      configService.setLocal('system.cronNotificationEnabled', !checked);
    });
  }, []);

  const handlePromptTimeoutChange = useCallback((val: number | undefined) => {
    setPromptTimeout(val as number);
  }, []);

  const handlePromptTimeoutBlur = useCallback(() => {
    const clamped = Math.max(30, Math.min(3600, promptTimeout || 300));
    setPromptTimeout(clamped);
    configService.set('acp.promptTimeout', clamped).catch(() => {});
  }, [promptTimeout]);

  const handleAgentIdleTimeoutChange = useCallback((val: number | undefined) => {
    setAgentIdleTimeout(val as number);
  }, []);

  const handleAgentIdleTimeoutBlur = useCallback(() => {
    const clamped = Math.max(1, Math.min(60, agentIdleTimeout || 5));
    setAgentIdleTimeout(clamped);
    configService.set('acp.agentIdleTimeout', clamped).catch(() => {});
  }, [agentIdleTimeout]);

  const handleSaveUploadToWorkspaceChange = useCallback((checked: boolean) => {
    setSaveUploadToWorkspace(checked);
    configService.set('upload.saveToWorkspace', checked).catch(() => {
      setSaveUploadToWorkspace(!checked);
      configService.setLocal('upload.saveToWorkspace', !checked);
    });
  }, []);

  const handleAutoPreviewOfficeFilesChange = useCallback((checked: boolean) => {
    setAutoPreviewOfficeFiles(checked);
    configService.set('system.autoPreviewOfficeFiles', checked).catch(() => {
      setAutoPreviewOfficeFiles(!checked);
      configService.setLocal('system.autoPreviewOfficeFiles', !checked);
    });
  }, []);

  const handleDeveloperModeChange = useCallback(
    (checked: boolean) => {
      const previous = developerMode;
      const enabled: DeveloperModeEnabled = checked ? 'on' : 'off';
      setDeveloperMode((current) => ({ ...current, enabled, switching: true }));

      withDeveloperModeTimeout(
        ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'developer_supervisor',
          dryRun: false,
          payloadRefsOnlyJson: {
            developerSupervisorEnabled: enabled,
            developerSupervisorMode: 'developer_apply_safe',
          },
        })
      )
        .then((result) => {
          const parsed = parseDeveloperModeSwitchState(result.stdout);
          if (parsed) {
            writeCachedDeveloperModeSwitchState(parsed);
            setDeveloperMode(parsed);
            void appStateQuery.load('full', { showRefreshing: true });
            return;
          }

          setDeveloperMode(previous);
          Message.error(t('settings.developerModeUpdateFailed'));
        })
        .catch(() => {
          setDeveloperMode(previous);
          Message.error(t('settings.developerModeUpdateFailed'));
        });
    },
    [appStateQuery.load, developerMode, t]
  );

  const paths = oplRecord(appStateQuery.appState.paths);
  const oplAgentCodexContext = oplRecord(appStateQuery.appState.opl_agent_codex_context);
  const systemInfo = {
    cacheDir: oplString(paths.cache_root) ?? '',
    workDir:
      oplString(paths.workspace_root_path) ??
      oplPathString(paths.workspace_root) ??
      oplPathString(paths.family_workspace_root) ??
      '',
    logDir: oplString(paths.logs_dir) ?? oplString(paths.logs_root) ?? oplString(paths.log_dir) ?? '',
  };

  const handleOpenLogDir = useCallback(() => {
    if (!systemInfo.logDir) return;
    void ipcBridge.shell.openFolderWith
      .invoke({ folder_path: systemInfo.logDir, tool: 'explorer' })
      .catch((caughtError) => {
        console.error('[SystemModalContent] Failed to open log directory:', caughtError);
      });
  }, [systemInfo.logDir]);

  // Initialize form data
  useEffect(() => {
    if (systemInfo.workDir) {
      initializingRef.current = true;
      form.setFieldsValue({ workDir: systemInfo.workDir });
      requestAnimationFrame(() => {
        initializingRef.current = false;
      });
    }
  }, [systemInfo.workDir, form]);

  const preferenceItems: PreferenceItem[] = [
    { key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> },
    {
      key: 'startOnBoot',
      label: t('settings.startOnBoot'),
      description: startOnBoot.supported ? t('settings.startOnBootDesc') : t('settings.startOnBootUnsupported'),
      component: (
        <Switch checked={startOnBoot.enabled} onChange={handleStartOnBootChange} disabled={!startOnBoot.supported} />
      ),
    },
    {
      key: 'developerMode',
      label: t('settings.developerMode'),
      description: developerModeDescription,
      testId: 'opl-developer-mode-row',
      component: (
        <Switch
          data-testid='opl-developer-mode-switch'
          checked={developerMode.enabled !== 'off'}
          loading={developerMode.switching || !developerMode.known}
          onChange={handleDeveloperModeChange}
        />
      ),
    },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      component: <Switch checked={closeToTray} onChange={handleCloseToTrayChange} />,
    },
    ...(isDesktop && gpuStatus
      ? [
          {
            key: 'hardwareAcceleration',
            label: t('settings.hardwareAcceleration'),
            description: gpuStatus.autoDisabled
              ? t('settings.hardwareAccelerationAutoDisabled')
              : t('settings.hardwareAccelerationDesc'),
            component: (
              <Switch
                checked={gpuStatus.userOverride !== 'force-off' && !gpuStatus.autoDisabled}
                onChange={handleHardwareAccelerationChange}
              />
            ),
          },
        ]
      : []),
    {
      key: 'promptTimeout',
      label: t('settings.promptTimeout'),
      component: (
        <InputNumber
          value={promptTimeout}
          onChange={handlePromptTimeoutChange}
          onBlur={handlePromptTimeoutBlur}
          max={3600}
          step={30}
          style={{ width: 120 }}
          suffix='s'
        />
      ),
    },
    {
      key: 'agentIdleTimeout',
      label: t('settings.agentIdleTimeout'),
      description: t('settings.agentIdleTimeoutDesc'),
      component: (
        <InputNumber
          value={agentIdleTimeout}
          onChange={handleAgentIdleTimeoutChange}
          onBlur={handleAgentIdleTimeoutBlur}
          max={60}
          step={5}
          style={{ width: 120 }}
          suffix='min'
        />
      ),
    },
    {
      key: 'saveUploadToWorkspace',
      label: t('settings.saveUploadToWorkspace'),
      component: <Switch checked={saveUploadToWorkspace} onChange={handleSaveUploadToWorkspaceChange} />,
    },
    {
      key: 'autoPreviewOfficeFiles',
      label: t('settings.autoPreviewOfficeFiles'),
      description: t('settings.autoPreviewOfficeFilesDesc'),
      component: <Switch checked={autoPreviewOfficeFiles} onChange={handleAutoPreviewOfficeFilesChange} />,
    },
  ];

  const saveDirConfigValidate = (_values: { workDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.workspaceRootChangeConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  const savingRef = useRef(false);

  const handleValuesChange = useCallback(
    async (_changedValue: unknown, allValues: Record<string, string>) => {
      if (initializingRef.current || savingRef.current) return;
      const { workDir } = allValues;
      const needsRestart = workDir !== systemInfo.workDir;
      if (!needsRestart) return;

      savingRef.current = true;
      setError(null);
      try {
        await saveDirConfigValidate({ workDir });
        await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'workspace_root_set',
          dryRun: false,
          payloadRefsOnlyJson: { path: workDir },
        });
        await appStateQuery.load('full', { showRefreshing: true });
        message.success(t('settings.oplEnvironmentPage.messages.workspaceRootSaved'));
      } catch (caughtError: unknown) {
        form.setFieldValue('workDir', systemInfo.workDir);
        if (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        savingRef.current = false;
      }
    },
    [appStateQuery.load, form, message, saveDirConfigValidate, systemInfo.workDir, t]
  );

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}
      {messageContextHolder}

      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <div key={item.key} data-testid={item.testId}>
                  <PreferenceRow label={item.label} description={item.description}>
                    {item.component}
                  </PreferenceRow>
                </div>
              ))}
            </div>
            {/* Notification settings with collapsible sub-options */}
            <Collapse
              bordered={false}
              activeKey={notificationEnabled ? ['notification'] : []}
              onChange={(_, keys) => {
                const shouldExpand = (keys as string[]).includes('notification');
                if (shouldExpand && !notificationEnabled) {
                  handleNotificationEnabledChange(true);
                } else if (!shouldExpand && notificationEnabled) {
                  handleNotificationEnabledChange(false);
                }
              }}
              className='[&_.arco-collapse-item]:!border-none [&_.arco-collapse-item-header]:!px-0 [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content-box]:!px-0 [&_.arco-collapse-item-content-box]:!pb-0'
            >
              <Collapse.Item
                name='notification'
                showExpandIcon={false}
                header={
                  <div className='flex flex-1 items-center justify-between w-full'>
                    <span className='text-14px text-2 ml-12px'>{t('settings.notification')}</span>
                    <Switch
                      checked={notificationEnabled}
                      onClick={(e) => e.stopPropagation()}
                      onChange={handleNotificationEnabledChange}
                    />
                  </div>
                }
              >
                <div className='pl-12px'>
                  <PreferenceRow label={t('settings.cronNotificationEnabled')}>
                    <Switch
                      checked={cronNotificationEnabled}
                      disabled={!notificationEnabled}
                      onChange={handleCronNotificationEnabledChange}
                    />
                  </PreferenceRow>
                </div>
              </Collapse.Item>
            </Collapse>
            <Form form={form} layout='vertical' className='!mt-32px space-y-16px' onValuesChange={handleValuesChange}>
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              {/* Log directory (read-only, click to open in file manager) */}
              <div>
                <Form.Item label={t('settings.logDir')}>
                  <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px bg-[var(--fill-0)] '>
                    <Tooltip content={systemInfo.logDir || ''} position='top'>
                      <div className='flex-1 min-w-0 text-13px text-t-primary truncate'>{systemInfo.logDir || ''}</div>
                    </Tooltip>
                    <Button
                      type='text'
                      style={{ borderLeft: '1px solid var(--color-border-2)', borderRadius: '0 8px 8px 0' }}
                      icon={<FolderSearch theme='outline' size='18' fill={iconColors.primary} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenLogDir();
                      }}
                    />
                  </div>
                </Form.Item>
              </div>
              {error && (
                <Alert
                  className='mt-16px'
                  type='error'
                  content={
                    <span>
                      {typeof error === 'string' ? error : JSON.stringify(error)}
                      <FeedbackButton module='system-settings' className='ml-6px' />
                    </span>
                  }
                />
              )}
            </Form>
          </div>

          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <PreferenceRow
              label={t('settings.oplAgentCodexContext')}
              description={t('settings.oplAgentCodexContextDesc')}
            >
              <span className='text-12px text-t-secondary text-right max-w-360px truncate'>
                {oplString(oplAgentCodexContext.contract_ref) ?? t('settings.unavailable')}
              </span>
            </PreferenceRow>
          </div>

          {/* Developer settings: DevTools + CDP (only visible in dev mode) */}
          <DevSettings />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
