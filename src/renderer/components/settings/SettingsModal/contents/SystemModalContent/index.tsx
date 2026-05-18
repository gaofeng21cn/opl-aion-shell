/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import { AUTO_PREVIEW_OFFICE_FILES_SWR_KEY } from '@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Button, Collapse, Form, InputNumber, Message, Modal, Switch, Tooltip } from '@arco-design/web-react';
import { FolderSearch } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate as mutateSWR } from 'swr';
import { useSettingsViewMode } from '../../settingsViewContext';
import DevSettings from './DevSettings';
import DirInputItem from './DirInputItem';
import PreferenceRow from './PreferenceRow';

const PROMPT_TIMEOUT_MIN_SEC = 30;
const PROMPT_TIMEOUT_DEFAULT_SEC = 43_200;
const PROMPT_TIMEOUT_MAX_SEC = 43_200;
const AGENT_IDLE_TIMEOUT_DEFAULT_MIN = 5;
const AGENT_IDLE_TIMEOUT_MAX_MIN = 60;
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

const DEFAULT_DEVELOPER_MODE_STATE: DeveloperModeSwitchState = {
  known: false,
  enabled: 'off',
  switching: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeDeveloperModeEnabled(value: unknown): DeveloperModeEnabled {
  return value === 'auto' || value === 'on' || value === 'off' ? value : 'off';
}

function parseDeveloperModeSwitchState(stdout: string): DeveloperModeSwitchState | null {
  try {
    const payload = asRecord(JSON.parse(stdout));
    const systemAction = asRecord(payload?.system_action);
    const supervisor = asRecord(systemAction?.developer_supervisor);
    const developerMode = asRecord(systemAction?.developer_mode);
    if (!supervisor && !developerMode) return null;

    const githubIdentity = asRecord(developerMode?.github_identity);
    return {
      known: true,
      enabled: normalizeDeveloperModeEnabled(supervisor?.enabled ?? developerMode?.enabled),
      mode:
        typeof supervisor?.mode === 'string'
          ? supervisor.mode
          : typeof developerMode?.mode === 'string'
            ? developerMode.mode
            : undefined,
      status: typeof developerMode?.status === 'string' ? developerMode.status : undefined,
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
  if (!developerMode.known) return 'settings.developerModeDesc';
  if (developerMode.enabled === 'off') return 'settings.developerModeStateOff';
  if (developerMode.enabled === 'auto') return 'settings.developerModeStateAuto';

  const blocked =
    developerMode.status === 'blocked' ||
    developerMode.effectiveState === 'blocked' ||
    developerMode.allowedRoute === 'blocked';
  return blocked ? 'settings.developerModeStateOnLimited' : 'settings.developerModeStateOnReady';
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
  const [error, setError] = useState<string | null>(null);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const initializingRef = useRef(true);

  const [startOnBoot, setStartOnBoot] = useState<IStartOnBootStatus>({
    supported: false,
    enabled: false,
    isPackaged: false,
    platform: 'web',
  });
  const [closeToTray, setCloseToTray] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);
  const [promptTimeout, setPromptTimeout] = useState<number>(PROMPT_TIMEOUT_DEFAULT_SEC);
  const [agentIdleTimeout, setAgentIdleTimeout] = useState<number>(AGENT_IDLE_TIMEOUT_DEFAULT_MIN);
  const [saveUploadToWorkspace, setSaveUploadToWorkspace] = useState(false);
  const [autoPreviewOfficeFiles, setAutoPreviewOfficeFiles] = useState(true);
  const [developerMode, setDeveloperMode] = useState<DeveloperModeSwitchState>(DEFAULT_DEVELOPER_MODE_STATE);

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
  }, [isDesktop]);

  useEffect(() => {
    ipcBridge.systemSettings.getCloseToTray
      .invoke()
      .then((enabled) => setCloseToTray(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    ipcBridge.systemSettings.getNotificationEnabled
      .invoke()
      .then((enabled) => setNotificationEnabled(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    ipcBridge.systemSettings.getCronNotificationEnabled
      .invoke()
      .then((enabled) => setCronNotificationEnabled(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    ConfigStorage.get('acp.promptTimeout')
      .then((val) => {
        if (val && val > 0) setPromptTimeout(val);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    ConfigStorage.get('acp.agentIdleTimeout')
      .then((val) => {
        if (val && val > 0) setAgentIdleTimeout(val);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    ipcBridge.systemSettings.getSaveUploadToWorkspace
      .invoke()
      .then((enabled) => setSaveUploadToWorkspace(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    ipcBridge.systemSettings.getAutoPreviewOfficeFiles
      .invoke()
      .then((enabled) => setAutoPreviewOfficeFiles(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    ipcBridge.shell.runOplCommand
      .invoke({ args: ['system', 'developer-supervisor'] })
      .then((result) => {
        if (cancelled) return;
        const parsed = result.exitCode === 0 ? parseDeveloperModeSwitchState(result.stdout) : null;
        setDeveloperMode(parsed ?? DEFAULT_DEVELOPER_MODE_STATE);
      })
      .catch(() => {
        if (!cancelled) {
          setDeveloperMode(DEFAULT_DEVELOPER_MODE_STATE);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCloseToTrayChange = useCallback((checked: boolean) => {
    setCloseToTray(checked);
    ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked }).catch(() => {
      setCloseToTray(!checked);
    });
  }, []);

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
    ipcBridge.systemSettings.setNotificationEnabled.invoke({ enabled: checked }).catch(() => {
      setNotificationEnabled(!checked);
    });
  }, []);

  const handleCronNotificationEnabledChange = useCallback((checked: boolean) => {
    setCronNotificationEnabled(checked);
    ipcBridge.systemSettings.setCronNotificationEnabled.invoke({ enabled: checked }).catch(() => {
      setCronNotificationEnabled(!checked);
    });
  }, []);

  const handlePromptTimeoutChange = useCallback((val: number | undefined) => {
    setPromptTimeout(val as number);
  }, []);

  const handlePromptTimeoutBlur = useCallback(() => {
    const clamped = Math.max(
      PROMPT_TIMEOUT_MIN_SEC,
      Math.min(PROMPT_TIMEOUT_MAX_SEC, promptTimeout || PROMPT_TIMEOUT_DEFAULT_SEC)
    );
    setPromptTimeout(clamped);
    ConfigStorage.set('acp.promptTimeout', clamped).catch(() => {});
  }, [promptTimeout]);

  const handleAgentIdleTimeoutChange = useCallback((val: number | undefined) => {
    setAgentIdleTimeout(val as number);
  }, []);

  const handleAgentIdleTimeoutBlur = useCallback(() => {
    const clamped = Math.max(
      1,
      Math.min(AGENT_IDLE_TIMEOUT_MAX_MIN, agentIdleTimeout || AGENT_IDLE_TIMEOUT_DEFAULT_MIN)
    );
    setAgentIdleTimeout(clamped);
    ConfigStorage.set('acp.agentIdleTimeout', clamped).catch(() => {});
  }, [agentIdleTimeout]);

  const handleSaveUploadToWorkspaceChange = useCallback((checked: boolean) => {
    setSaveUploadToWorkspace(checked);
    ipcBridge.systemSettings.setSaveUploadToWorkspace.invoke({ enabled: checked }).catch(() => {
      setSaveUploadToWorkspace(!checked);
    });
  }, []);

  const handleAutoPreviewOfficeFilesChange = useCallback((checked: boolean) => {
    setAutoPreviewOfficeFiles(checked);
    void mutateSWR(AUTO_PREVIEW_OFFICE_FILES_SWR_KEY, checked, {
      revalidate: false,
    });
    ipcBridge.systemSettings.setAutoPreviewOfficeFiles.invoke({ enabled: checked }).catch(() => {
      setAutoPreviewOfficeFiles(!checked);
      void mutateSWR(AUTO_PREVIEW_OFFICE_FILES_SWR_KEY, !checked, {
        revalidate: false,
      });
    });
  }, []);

  const handleDeveloperModeChange = useCallback(
    (checked: boolean) => {
      const previous = developerMode;
      const enabled: DeveloperModeEnabled = checked ? 'on' : 'off';
      setDeveloperMode((current) => ({ ...current, enabled, switching: true }));

      ipcBridge.shell.runOplCommand
        .invoke({ args: ['system', 'developer-supervisor', '--enabled', enabled] })
        .then((result) => {
          const parsed = result.exitCode === 0 ? parseDeveloperModeSwitchState(result.stdout) : null;
          if (parsed) {
            setDeveloperMode(parsed);
            return;
          }

          setDeveloperMode(previous);
          Message.error(result.stderr || t('settings.developerModeUpdateFailed'));
        })
        .catch(() => {
          setDeveloperMode(previous);
          Message.error(t('settings.developerModeUpdateFailed'));
        });
    },
    [developerMode, t]
  );

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      initializingRef.current = true;
      form.setFieldsValue({ cacheDir: systemInfo.cacheDir, workDir: systemInfo.workDir });
      requestAnimationFrame(() => {
        initializingRef.current = false;
      });
    }
  }, [systemInfo, form]);

  const preferenceItems = [
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
          loading={developerMode.switching}
          onChange={handleDeveloperModeChange}
        />
      ),
    },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      component: <Switch checked={closeToTray} onChange={handleCloseToTrayChange} />,
    },
    {
      key: 'promptTimeout',
      label: t('settings.promptTimeout'),
      component: (
        <InputNumber
          value={promptTimeout}
          onChange={handlePromptTimeoutChange}
          onBlur={handlePromptTimeoutBlur}
          max={PROMPT_TIMEOUT_MAX_SEC}
          step={300}
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
          max={AGENT_IDLE_TIMEOUT_MAX_MIN}
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

  const saveDirConfigValidate = (_values: { cacheDir: string; workDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  const savingRef = useRef(false);

  const handleValuesChange = useCallback(
    async (_changedValue: unknown, allValues: Record<string, string>) => {
      if (initializingRef.current || savingRef.current || !systemInfo) return;
      const { cacheDir, workDir } = allValues;
      const needsRestart = cacheDir !== systemInfo.cacheDir || workDir !== systemInfo.workDir;
      if (!needsRestart) return;

      savingRef.current = true;
      setError(null);
      try {
        await saveDirConfigValidate({ cacheDir, workDir });
        const result = await ipcBridge.application.updateSystemInfo.invoke({ cacheDir, workDir });
        if (result.success) {
          await ipcBridge.application.restart.invoke();
        } else {
          setError(result.msg || 'Failed to update system info');
          form.setFieldValue('cacheDir', systemInfo.cacheDir);
          form.setFieldValue('workDir', systemInfo.workDir);
        }
      } catch (caughtError: unknown) {
        form.setFieldValue('cacheDir', systemInfo.cacheDir);
        form.setFieldValue('workDir', systemInfo.workDir);
        if (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        savingRef.current = false;
      }
    },
    [systemInfo, form, saveDirConfigValidate]
  );

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}

      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label} description={item.description} testId={item.testId}>
                  {item.component}
                </PreferenceRow>
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
            <Form form={form} layout='vertical' className='space-y-16px' onValuesChange={handleValuesChange}>
              <DirInputItem label={t('settings.cacheDir')} field='cacheDir' />
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              {/* Log directory (read-only, click to open in file manager) */}
              <div className='!mt-32px'>
                <Form.Item label={t('settings.logDir')}>
                  <div className='aion-dir-input h-[32px] flex items-center rounded-8px border border-solid border-transparent pl-14px bg-[var(--fill-0)] '>
                    <Tooltip content={systemInfo?.logDir || ''} position='top'>
                      <div className='flex-1 min-w-0 text-13px text-t-primary truncate'>{systemInfo?.logDir || ''}</div>
                    </Tooltip>
                    <Button
                      type='text'
                      style={{ borderLeft: '1px solid var(--color-border-2)', borderRadius: '0 8px 8px 0' }}
                      icon={<FolderSearch theme='outline' size='18' fill={iconColors.primary} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (systemInfo?.logDir) {
                          void ipcBridge.shell.openFile.invoke(systemInfo.logDir);
                        }
                      }}
                    />
                  </div>
                </Form.Item>
              </div>
              {error && (
                <Alert
                  className='mt-16px'
                  type='error'
                  content={typeof error === 'string' ? error : JSON.stringify(error)}
                />
              )}
            </Form>
          </div>

          {/* Developer settings: DevTools + CDP (only visible in dev mode) */}
          <DevSettings />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
