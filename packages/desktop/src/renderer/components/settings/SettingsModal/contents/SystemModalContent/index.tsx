/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IGpuStatus, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { getOplDeveloperProfileSettings, getOplFlowContextPolicy } from '@/common/config/oplProductProfile';
import { configService } from '@/common/config/configService';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { iconColors } from '@/renderer/styles/colors';
import { notifyManualRestartRequired } from '@/renderer/utils/appRestart';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Collapse, Form, InputNumber, Message, Modal, Switch, Tooltip } from '@arco-design/web-react';
import { FolderSearch } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../../settingsViewContext';
import DevSettings from './DevSettings';
import DirInputItem from './DirInputItem';
import PreferenceRow from './PreferenceRow';
import VoiceInputSection from './VoiceInputSection';

type PreferenceItem = {
  key: string;
  label: string;
  component: React.ReactNode;
  description?: string;
  testId?: string;
};

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

type DeveloperCapabilityDisplay = {
  id: string;
  status: string;
  level: string;
};

const OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE =
  getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement;

const USER_VISIBLE_DEVELOPER_PROFILE_STATES = new Set([
  'contributor',
  'maintainer',
  'runtime_maintainer',
  'standard_user',
  'source_channel_opt_in',
  'developer_limited',
  'developer_ready',
]);

function normalizeDeveloperProfileState(state: string): string {
  return USER_VISIBLE_DEVELOPER_PROFILE_STATES.has(state) ? state : 'unavailable';
}

function readDeveloperCapabilityDisplay(value: unknown, id: string): DeveloperCapabilityDisplay | null {
  const capability = oplRecord(value);
  const status = oplString(capability.status) ?? 'unknown';
  const level = oplString(capability.level) ?? status;
  return status === 'unknown' && level === 'unknown' ? null : { id, status, level };
}

function readIntelligenceEnhancementEnabled(value: unknown): boolean | null {
  const parsed = oplRecord(value);
  const execution = oplRecord(parsed.app_action_execution);
  const result = oplRecord(execution.result);
  const directStatus = oplRecord(result.opl_flow_intelligence_enhancement);
  const actionStatus = oplRecord(oplRecord(result.opl_flow_intelligence_enhancement_action).status_readback);
  const enabled = typeof directStatus.enabled === 'boolean' ? directStatus.enabled : actionStatus.enabled;
  return typeof enabled === 'boolean' ? enabled : null;
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
  const appState = appStateQuery.appState;
  const appPaths = oplRecord(appState.paths);
  const appWorkspaceRoot =
    oplString(appPaths.workspace_root_path) ??
    oplPathString(appPaths.workspace_root) ??
    oplPathString(appPaths.family_workspace_root);
  const appLogsDir = oplString(appPaths.logs_dir) ?? oplString(appPaths.logs_root) ?? oplString(appPaths.log_dir);
  const developerProfileSettings = getOplDeveloperProfileSettings();
  const appDeveloperProfile = oplRecord(appState.developer_profile);
  const appDeveloperCapabilities = oplRecord(appDeveloperProfile.capabilities);
  const developerProfileState =
    oplString(appDeveloperProfile.profile_id) ??
    oplString(appDeveloperProfile.level) ??
    oplString(appDeveloperProfile.status) ??
    'unavailable';
  const developerProfileDisplayState = normalizeDeveloperProfileState(developerProfileState);
  const developerProfileDescription = t(developerProfileSettings.description_key);
  const developerProfileCapabilities = developerProfileSettings.capability_axes
    .map((axis) => readDeveloperCapabilityDisplay(appDeveloperCapabilities[axis], axis))
    .filter((entry): entry is DeveloperCapabilityDisplay => Boolean(entry));

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
  const [oplFlowIntelligenceEnhancementMode, setOplFlowIntelligenceEnhancementMode] = useState(false);
  const [oplFlowIntelligenceEnhancementApplying, setOplFlowIntelligenceEnhancementApplying] = useState(false);

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
    if (isDesktop) {
      ipcBridge.systemSettings.getCloseToTray
        .invoke()
        .then((enabled) => {
          setCloseToTray(enabled);
          configService.setLocal('system.closeToTray', enabled);
        })
        .catch(() => {});
    }
    setNotificationEnabled(configService.get('system.notificationEnabled') ?? true);
    setCronNotificationEnabled(configService.get('system.cronNotificationEnabled') ?? false);
    setSaveUploadToWorkspace(configService.get('upload.saveToWorkspace') ?? false);
    setAutoPreviewOfficeFiles(configService.get('system.autoPreviewOfficeFiles') ?? true);
    if (OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) {
      setOplFlowIntelligenceEnhancementMode(
        configService.get(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key) ?? false
      );
      ipcBridge.oplRuntime.executeAction
        .invoke({
          actionId: OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.status_action_id,
          dryRun: false,
        })
        .then((result) => {
          if (result.ok === false) return;
          const enabled = readIntelligenceEnhancementEnabled(result.parsed);
          if (enabled === null) return;
          setOplFlowIntelligenceEnhancementMode(enabled);
          configService.setLocal(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key, enabled);
        })
        .catch(() => {});
    }
    const pt = configService.get('acp.promptTimeout');
    if (pt && pt > 0) setPromptTimeout(pt);
    const ait = configService.get('acp.agentIdleTimeout');
    if (ait && ait > 0) setAgentIdleTimeout(ait);
  }, [isDesktop]);

  const handleCloseToTrayChange = useCallback(
    (checked: boolean) => {
      const previous = closeToTray;
      setCloseToTray(checked);
      configService.setLocal('system.closeToTray', checked);

      if (!isDesktop) {
        configService.set('system.closeToTray', checked).catch(() => {
          setCloseToTray(previous);
          configService.setLocal('system.closeToTray', previous);
        });
        return;
      }

      ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked }).catch(() => {
        setCloseToTray(previous);
        configService.setLocal('system.closeToTray', previous);
      });
    },
    [closeToTray, isDesktop]
  );

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
              ipcBridge.application.restart
                .invoke()
                .then((restartResult) => notifyManualRestartRequired(restartResult, t))
                .catch(() => {});
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

  const handleOplFlowIntelligenceEnhancementModeChange = useCallback(async (checked: boolean) => {
    if (!OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) return;
    const previous = oplFlowIntelligenceEnhancementMode;
    setOplFlowIntelligenceEnhancementMode(checked);
    setOplFlowIntelligenceEnhancementApplying(true);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: checked
          ? OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.enable_action_id
          : OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.disable_action_id,
        dryRun: false,
      });
      if (result.ok === false) {
        throw new Error(result.error?.message || 'OPL Flow intelligence enhancement action failed');
      }
      const enabled = readIntelligenceEnhancementEnabled(result.parsed) ?? checked;
      setOplFlowIntelligenceEnhancementMode(enabled);
      await configService.set(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key, enabled);
      void appStateQuery.load('fast', { showRefreshing: true }).catch(() => {});
    } catch (caughtError) {
      setOplFlowIntelligenceEnhancementMode(previous);
      configService.setLocal(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key, previous);
      Message.error(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setOplFlowIntelligenceEnhancementApplying(false);
    }
  }, [appStateQuery.load, oplFlowIntelligenceEnhancementMode]);

  const oplFlowContext = oplRecord(appState.opl_flow_context);
  const oplFlowContextDisplay =
    oplString(oplFlowContext.flow_id) ?? oplString(oplFlowContext.contract_ref) ?? t('settings.unavailable');
  const oplFlowContextSource = oplString(oplFlowContext.source);
  const systemInfo = {
    cacheDir: oplString(appPaths.cache_root) ?? '',
    workDir: appWorkspaceRoot ?? '',
    logDir: appLogsDir ?? '',
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
      form.setFieldsValue({ workDir: systemInfo.workDir, logDir: systemInfo.logDir });
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

  const saveDirConfigValidate = (_values: { workDir: string; logDir: string }): Promise<unknown> => {
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
        await saveDirConfigValidate({ workDir, logDir: systemInfo.logDir });
        await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'workspace_root_set',
          dryRun: false,
          payloadRefsOnlyJson: { path: workDir },
        });
        await appStateQuery.load('fast', { showRefreshing: true });
        message.success(t('settings.oplEnvironmentPage.messages.workspaceRootSaved'));
      } catch (caughtError: unknown) {
        form.setFieldsValue({ workDir: systemInfo.workDir, logDir: systemInfo.logDir });
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
                      style={{
                        borderLeft: '1px solid var(--color-border-2)',
                        borderRadius: '0 8px 8px 0',
                      }}
                      icon={<FolderSearch theme='outline' size='18' fill={iconColors.primary} />}
                      onClick={(e: Event) => {
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
              label={t(developerProfileSettings.label_key)}
              description={developerProfileDescription}
              testId='opl-developer-profile-row'
            >
              <div className='text-12px text-t-secondary text-right max-w-420px space-y-6px'>
                <span
                  className='inline-flex px-10px py-4px rd-6px text-13px bg-fill-1 text-t-primary font-500'
                  data-testid='opl-developer-profile-status'
                >
                  {developerProfileDisplayState === 'unavailable'
                    ? t('settings.unavailable')
                    : t(`settings.oplDeveloperProfileStates.${developerProfileDisplayState}`, {
                        defaultValue: developerProfileDisplayState,
                      })}
                </span>
                {developerProfileCapabilities.length > 0 && (
                  <div className='flex flex-wrap justify-end gap-6px'>
                    {developerProfileCapabilities.map((capability) => (
                      <span
                        key={capability.id}
                        className='px-8px py-3px rd-6px bg-fill-1 text-11px text-t-secondary'
                        data-testid={`opl-developer-capability-${capability.id}`}
                      >
                        {capability.id}: {capability.level}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </PreferenceRow>
            <PreferenceRow
              label={t('settings.oplFlowContext')}
              description={t('settings.oplFlowContextDesc')}
              testId='opl-flow-context-row'
            >
              <div className='text-12px text-t-secondary text-right max-w-320px truncate'>
                <div className='text-t-primary font-500 truncate'>{oplFlowContextDisplay}</div>
                {oplFlowContextSource && <div className='truncate'>{oplFlowContextSource}</div>}
              </div>
            </PreferenceRow>
            {OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE && (
              <PreferenceRow
                label={t(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.label_key)}
                description={t(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.description_key)}
                testId='opl-flow-intelligence-enhancement-mode-row'
              >
                <Switch
                  checked={oplFlowIntelligenceEnhancementMode}
                  onChange={handleOplFlowIntelligenceEnhancementModeChange}
                  loading={oplFlowIntelligenceEnhancementApplying}
                />
              </PreferenceRow>
            )}
          </div>

          {/* Developer settings: DevTools + CDP (only visible in dev mode) */}
          <DevSettings />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
