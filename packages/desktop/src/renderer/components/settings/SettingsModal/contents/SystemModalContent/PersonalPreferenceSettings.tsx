/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IGpuStatus, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { notifyManualRestartRequired } from '@/renderer/utils/appRestart';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { InputNumber, Message, Modal, Switch } from '@arco-design/web-react';
import { SettingConfig } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PreferenceRow from './PreferenceRow';

type PreferenceItem = {
  key: string;
  label: string;
  component: React.ReactNode;
  description?: string;
  testId?: string;
};

const PersonalPreferenceSettings: React.FC = () => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [modal, modalContextHolder] = Modal.useModal();
  const [startOnBoot, setStartOnBoot] = useState<IStartOnBootStatus>({
    supported: false,
    enabled: false,
    isPackaged: false,
    platform: 'web',
  });
  const [closeToTray, setCloseToTray] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<IGpuStatus | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);
  const [promptTimeout, setPromptTimeout] = useState<number>(300);
  const [agentIdleTimeout, setAgentIdleTimeout] = useState<number>(5);
  const [saveUploadToWorkspace, setSaveUploadToWorkspace] = useState(false);
  const [autoPreviewOfficeFiles, setAutoPreviewOfficeFiles] = useState(true);
  const [saveStates, setSaveStates] = useState<Record<string, 'saving' | 'saved' | 'error' | 'dirty'>>({});
  const savingKeys = useRef(new Set<string>());
  const savedTimeouts = useRef({ promptTimeout: 300, agentIdleTimeout: 5 });

  const savePreference = useCallback(async (key: string, apply: () => Promise<unknown>, rollback: () => void) => {
    if (savingKeys.current.has(key)) return;
    savingKeys.current.add(key);
    setSaveStates((states) => ({ ...states, [key]: 'saving' }));
    try {
      await apply();
      setSaveStates((states) => ({ ...states, [key]: 'saved' }));
    } catch {
      rollback();
      setSaveStates((states) => ({ ...states, [key]: 'error' }));
    } finally {
      savingKeys.current.delete(key);
    }
  }, []);

  const saveFeedback = (key: string) =>
    saveStates[key] ? (
      <span role='status' aria-live='polite' className='block mt-4px text-12px text-t-secondary'>
        {saveStates[key] === 'dirty'
          ? t('settings.personalization.unsaved')
          : saveStates[key] === 'saving'
            ? t('settings.preferenceSave.saving', { defaultValue: 'Saving…' })
            : saveStates[key] === 'saved'
              ? t('settings.preferenceSave.saved', { defaultValue: 'Saved' })
              : t('settings.preferenceSave.error', {
                  defaultValue: 'Could not save. Previous value restored. Try again.',
                })}
      </span>
    ) : null;

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
    setKeepAwake(configService.get('system.keepAwake') ?? false);
    if (isDesktop) {
      ipcBridge.systemSettings.getCloseToTray
        .invoke()
        .then((enabled) => {
          setCloseToTray(enabled);
          configService.setLocal('system.closeToTray', enabled);
        })
        .catch(() => {});
      ipcBridge.systemSettings.getKeepAwake
        .invoke()
        .then((enabled) => {
          setKeepAwake(enabled);
          configService.setLocal('system.keepAwake', enabled);
        })
        .catch(() => {});
    }
    setNotificationEnabled(configService.get('system.notificationEnabled') ?? true);
    setCronNotificationEnabled(configService.get('system.cronNotificationEnabled') ?? false);
    setSaveUploadToWorkspace(configService.get('upload.saveToWorkspace') ?? false);
    setAutoPreviewOfficeFiles(configService.get('system.autoPreviewOfficeFiles') ?? true);
    const pt = configService.get('acp.promptTimeout');
    if (pt && pt > 0) {
      setPromptTimeout(pt);
      savedTimeouts.current.promptTimeout = pt;
    }
    const ait = configService.get('acp.agentIdleTimeout');
    if (ait && ait > 0) {
      setAgentIdleTimeout(ait);
      savedTimeouts.current.agentIdleTimeout = ait;
    }
  }, [isDesktop]);

  const handleCloseToTrayChange = (checked: boolean) => {
    const previous = closeToTray;
    setCloseToTray(checked);
    configService.setLocal('system.closeToTray', checked);
    void savePreference(
      'closeToTray',
      () =>
        isDesktop
          ? ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked })
          : configService.set('system.closeToTray', checked),
      () => {
        setCloseToTray(previous);
        configService.setLocal('system.closeToTray', previous);
      }
    );
  };

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

      const apply = () =>
        savePreference(
          'hardwareAcceleration',
          async () => {
            const result = await ipcBridge.application.setGpuOverride.invoke({
              override: checked ? 'force-on' : 'force-off',
            });
            if (!result.success || !result.data) throw new Error(result.msg);
            setGpuStatus(result.data);
            void ipcBridge.application.restart
              .invoke()
              .then((restartResult) => notifyManualRestartRequired(restartResult, t))
              .catch(() => {});
          },
          () => {
            setGpuStatus(previous);
            Message.error(t('settings.hardwareAccelerationUpdateFailed'));
          }
        );

      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.hardwareAccelerationRestartConfirm'),
        onOk: apply,
        onCancel: () => setGpuStatus(previous),
      });
    },
    [gpuStatus, modal, t, savePreference]
  );

  const handleKeepAwakeChange = (checked: boolean) => {
    const previous = keepAwake;
    setKeepAwake(checked);
    configService.setLocal('system.keepAwake', checked);
    void savePreference(
      'keepAwake',
      () => ipcBridge.systemSettings.setKeepAwake.invoke({ enabled: checked }),
      () => {
        setKeepAwake(previous);
        configService.setLocal('system.keepAwake', previous);
      }
    );
  };

  const handleStartOnBootChange = (checked: boolean) => {
    const previous = startOnBoot;
    setStartOnBoot((status) => ({ ...status, enabled: checked }));
    void savePreference(
      'startOnBoot',
      async () => {
        const result = await ipcBridge.application.setStartOnBoot.invoke({ enabled: checked });
        if (!result.success || !result.data) throw new Error(result.msg);
        setStartOnBoot(result.data);
      },
      () => setStartOnBoot(previous)
    );
  };

  const handleNotificationEnabledChange = (checked: boolean) => {
    const previous = notificationEnabled;
    setNotificationEnabled(checked);
    void savePreference(
      'notificationEnabled',
      () => configService.set('system.notificationEnabled', checked),
      () => {
        setNotificationEnabled(previous);
        configService.setLocal('system.notificationEnabled', previous);
      }
    );
  };

  const handleCronNotificationEnabledChange = (checked: boolean) => {
    const previous = cronNotificationEnabled;
    setCronNotificationEnabled(checked);
    void savePreference(
      'cronNotificationEnabled',
      () => configService.set('system.cronNotificationEnabled', checked),
      () => {
        setCronNotificationEnabled(previous);
        configService.setLocal('system.cronNotificationEnabled', previous);
      }
    );
  };

  const handlePromptTimeoutChange = (val: number | undefined) => {
    setPromptTimeout(val as number);
    setSaveStates((states) => ({ ...states, promptTimeout: 'dirty' }));
  };
  const handlePromptTimeoutBlur = () => {
    const clamped = Math.max(30, Math.min(3600, promptTimeout || 300));
    const previous = savedTimeouts.current.promptTimeout;
    setPromptTimeout(clamped);
    if (clamped === previous) {
      setSaveStates((states) => ({ ...states, promptTimeout: 'saved' }));
      return;
    }
    void savePreference(
      'promptTimeout',
      async () => {
        await configService.set('acp.promptTimeout', clamped);
        savedTimeouts.current.promptTimeout = clamped;
      },
      () => {
        setPromptTimeout(previous);
        configService.setLocal('acp.promptTimeout', previous);
      }
    );
  };

  const handleAgentIdleTimeoutChange = (val: number | undefined) => {
    setAgentIdleTimeout(val as number);
    setSaveStates((states) => ({ ...states, agentIdleTimeout: 'dirty' }));
  };
  const handleAgentIdleTimeoutBlur = () => {
    const clamped = Math.max(1, Math.min(60, agentIdleTimeout || 5));
    const previous = savedTimeouts.current.agentIdleTimeout;
    setAgentIdleTimeout(clamped);
    if (clamped === previous) {
      setSaveStates((states) => ({ ...states, agentIdleTimeout: 'saved' }));
      return;
    }
    void savePreference(
      'agentIdleTimeout',
      async () => {
        await configService.set('acp.agentIdleTimeout', clamped);
        savedTimeouts.current.agentIdleTimeout = clamped;
      },
      () => {
        setAgentIdleTimeout(previous);
        configService.setLocal('acp.agentIdleTimeout', previous);
      }
    );
  };

  const handleSaveUploadToWorkspaceChange = (checked: boolean) => {
    const previous = saveUploadToWorkspace;
    setSaveUploadToWorkspace(checked);
    void savePreference(
      'saveUploadToWorkspace',
      () => configService.set('upload.saveToWorkspace', checked),
      () => {
        setSaveUploadToWorkspace(previous);
        configService.setLocal('upload.saveToWorkspace', previous);
      }
    );
  };

  const handleAutoPreviewOfficeFilesChange = (checked: boolean) => {
    const previous = autoPreviewOfficeFiles;
    setAutoPreviewOfficeFiles(checked);
    void savePreference(
      'autoPreviewOfficeFiles',
      () => configService.set('system.autoPreviewOfficeFiles', checked),
      () => {
        setAutoPreviewOfficeFiles(previous);
        configService.setLocal('system.autoPreviewOfficeFiles', previous);
      }
    );
  };

  const appBehaviorPreferenceItems: PreferenceItem[] = [
    {
      key: 'startOnBoot',
      label: t('settings.startOnBoot'),
      description: startOnBoot.supported ? t('settings.startOnBootDesc') : t('settings.startOnBootUnsupported'),
      component: (
        <Switch
          checked={startOnBoot.enabled}
          onChange={handleStartOnBootChange}
          disabled={!startOnBoot.supported || saveStates.startOnBoot === 'saving'}
        />
      ),
    },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      description: t('settings.closeToTrayDesc'),
      component: (
        <Switch
          disabled={saveStates.closeToTray === 'saving'}
          checked={closeToTray}
          onChange={handleCloseToTrayChange}
        />
      ),
    },
    {
      key: 'keepAwake',
      label: t('settings.keepAwake'),
      description: t('settings.keepAwakeDesc'),
      testId: 'settings-keep-awake',
      component: (
        <Switch disabled={saveStates.keepAwake === 'saving'} checked={keepAwake} onChange={handleKeepAwakeChange} />
      ),
    },
    {
      key: 'saveUploadToWorkspace',
      label: t('settings.saveUploadToWorkspace'),
      component: (
        <Switch
          disabled={saveStates.saveUploadToWorkspace === 'saving'}
          checked={saveUploadToWorkspace}
          onChange={handleSaveUploadToWorkspaceChange}
        />
      ),
    },
    {
      key: 'autoPreviewOfficeFiles',
      label: t('settings.autoPreviewOfficeFiles'),
      description: t('settings.autoPreviewOfficeFilesDesc'),
      component: (
        <Switch
          disabled={saveStates.autoPreviewOfficeFiles === 'saving'}
          checked={autoPreviewOfficeFiles}
          onChange={handleAutoPreviewOfficeFilesChange}
        />
      ),
    },
  ];

  const performancePreferenceItems: PreferenceItem[] = [
    {
      key: 'promptTimeout',
      label: t('settings.promptTimeout'),
      description: t('settings.promptTimeoutDesc'),
      component: (
        <InputNumber
          disabled={saveStates.promptTimeout === 'saving'}
          aria-label={t('settings.promptTimeout')}
          value={promptTimeout}
          onChange={handlePromptTimeoutChange}
          onBlur={handlePromptTimeoutBlur}
          max={3600}
          step={30}
          style={{ width: 120 }}
          suffix={t('settings.uiOptimization.preferences.units.second')}
        />
      ),
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
                disabled={saveStates.hardwareAcceleration === 'saving'}
                checked={gpuStatus.userOverride !== 'force-off' && !gpuStatus.autoDisabled}
                onChange={handleHardwareAccelerationChange}
              />
            ),
          },
        ]
      : []),
  ];

  const backgroundPreferenceItems: PreferenceItem[] = [
    {
      key: 'agentIdleTimeout',
      label: t('settings.agentIdleTimeout'),
      description: t('settings.agentIdleTimeoutDesc'),
      component: (
        <InputNumber
          disabled={saveStates.agentIdleTimeout === 'saving'}
          aria-label={t('settings.agentIdleTimeout')}
          value={agentIdleTimeout}
          onChange={handleAgentIdleTimeoutChange}
          onBlur={handleAgentIdleTimeoutBlur}
          max={60}
          step={5}
          style={{ width: 120 }}
          suffix={t('settings.uiOptimization.preferences.units.minute')}
        />
      ),
    },
  ];

  return (
    <>
      {modalContextHolder}

      <section className='opl-settings-section' id='app-behavior' data-testid='settings-preferences-primary'>
        <span id='behavior' aria-hidden='true' />
        <span id='notifications' aria-hidden='true' />
        <span id='startup-window' aria-hidden='true' />
        <span id='tray' aria-hidden='true' />
        <span id='files-notifications' aria-hidden='true' />
        <div className='opl-settings-section__header'>
          <div className='flex min-w-0 items-start gap-12px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
              <SettingConfig theme='outline' size='16' />
            </span>
            <div className='min-w-0'>
              <div className='text-14px font-medium text-t-primary leading-22px'>
                {t('settings.appBehaviorPreferencesTitle')}
              </div>
              <div className='mt-2px text-12px text-t-tertiary leading-18px'>
                {t('settings.appBehaviorPreferencesDesc')}
              </div>
            </div>
          </div>
        </div>
        <div className='opl-settings-list'>
          {appBehaviorPreferenceItems.map((item) => (
            <PreferenceRow key={item.key} label={item.label} description={item.description} testId={item.testId}>
              {item.component}
              {saveFeedback(item.key)}
            </PreferenceRow>
          ))}
          <PreferenceRow
            testId='settings-notification'
            label={t('settings.notification')}
            description={t('settings.notificationPreferencesDesc')}
          >
            <Switch
              disabled={saveStates.notificationEnabled === 'saving'}
              checked={notificationEnabled}
              onChange={handleNotificationEnabledChange}
            />
            {saveFeedback('notificationEnabled')}
          </PreferenceRow>
          <PreferenceRow label={t('settings.cronNotificationEnabled')}>
            <Switch
              checked={cronNotificationEnabled}
              disabled={!notificationEnabled || saveStates.cronNotificationEnabled === 'saving'}
              onChange={handleCronNotificationEnabledChange}
            />
            {saveFeedback('cronNotificationEnabled')}
          </PreferenceRow>
        </div>
      </section>

      <section className='opl-settings-section' data-testid='preferences-performance-section'>
        <details className='group'>
          <summary className='opl-settings-section__header cursor-pointer'>
            <div className='flex min-w-0 items-start gap-12px'>
              <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                <SettingConfig theme='outline' size='16' />
              </span>
              <div className='min-w-0'>
                <div className='text-14px font-medium text-t-primary leading-22px'>
                  {t('settings.performancePreferencesTitle')}
                </div>
                <div className='mt-2px text-12px text-t-tertiary leading-18px'>
                  {t('settings.timeoutPreferencesDesc')}
                </div>
              </div>
            </div>
            <span aria-hidden='true' className='text-20px text-t-secondary transition-transform group-open:rotate-90'>
              ›
            </span>
          </summary>
          <div className='opl-settings-list' id='models-performance'>
            <span id='hardware' aria-hidden='true' />
            {[...performancePreferenceItems, ...backgroundPreferenceItems].map((item) => (
              <PreferenceRow key={item.key} label={item.label} description={item.description} testId={item.testId}>
                {item.component}
                {saveFeedback(item.key)}
              </PreferenceRow>
            ))}
          </div>
        </details>
      </section>
    </>
  );
};

export default PersonalPreferenceSettings;
