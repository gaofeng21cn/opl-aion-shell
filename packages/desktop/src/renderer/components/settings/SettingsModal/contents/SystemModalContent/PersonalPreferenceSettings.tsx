/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IGpuStatus, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import { notifyManualRestartRequired } from '@/renderer/utils/appRestart';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { InputNumber, Message, Modal, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
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
  const [gpuStatus, setGpuStatus] = useState<IGpuStatus | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);
  const [promptTimeout, setPromptTimeout] = useState<number>(300);
  const [agentIdleTimeout, setAgentIdleTimeout] = useState<number>(5);
  const [saveUploadToWorkspace, setSaveUploadToWorkspace] = useState(false);
  const [autoPreviewOfficeFiles, setAutoPreviewOfficeFiles] = useState(true);

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

  const behaviorPreferenceItems: PreferenceItem[] = [
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

  const advancedPreferenceItems: PreferenceItem[] = [
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
  ];

  return (
    <>
      {modalContextHolder}

      <section className='opl-settings-section' data-testid='appearance-behavior-section'>
        <div className='opl-settings-section__header'>
          <div className='text-14px font-medium text-t-primary leading-22px'>
            {t('settings.appBehaviorPreferencesTitle')}
          </div>
          <div className='text-12px text-t-tertiary mt-4px'>{t('settings.appBehaviorPreferencesDesc')}</div>
        </div>
        <div className='opl-settings-list'>
          {behaviorPreferenceItems.map((item) => (
            <div key={item.key} data-testid={item.testId}>
              <PreferenceRow label={item.label} description={item.description}>
                {item.component}
              </PreferenceRow>
            </div>
          ))}
          <PreferenceRow label={t('settings.notification')}>
            <Switch checked={notificationEnabled} onChange={handleNotificationEnabledChange} />
          </PreferenceRow>
          <PreferenceRow label={t('settings.cronNotificationEnabled')}>
            <Switch
              checked={cronNotificationEnabled}
              disabled={!notificationEnabled}
              onChange={handleCronNotificationEnabledChange}
            />
          </PreferenceRow>
        </div>
      </section>

      <section className='opl-settings-section'>
        <details className='opl-settings-details' data-testid='advanced-preferences'>
          <summary className='cursor-pointer text-14px font-medium text-t-primary'>
            {t('settings.advancedSettings')}
          </summary>
          <div className='mt-8px text-12px text-t-tertiary'>{t('settings.timeoutPreferencesDesc')}</div>
          <div className='opl-settings-list mt-10px'>
            {advancedPreferenceItems.map((item) => (
              <div key={item.key} data-testid={item.testId}>
                <PreferenceRow label={item.label} description={item.description}>
                  {item.component}
                </PreferenceRow>
              </div>
            ))}
          </div>
        </details>
      </section>
    </>
  );
};

export default PersonalPreferenceSettings;
