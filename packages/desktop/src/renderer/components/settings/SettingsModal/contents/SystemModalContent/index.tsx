/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getOplDeveloperProfileSettings, getOplFlowContextPolicy } from '@/common/config/oplProductProfile';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Message, Switch, Tag, Tooltip } from '@arco-design/web-react';
import { FolderSearch } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../../settingsViewContext';
import DevSettings from './DevSettings';
import PreferenceRow from './PreferenceRow';

function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

type DeveloperCapabilityDisplay = {
  id: string;
  status: string;
  level: string;
};

type DeveloperCapabilityState = 'available' | 'attention' | 'unavailable';

type ReadOnlyPathRowProps = {
  label: string;
  path: string;
  onOpen: () => void;
};

const ReadOnlyPathRow: React.FC<ReadOnlyPathRowProps> = ({ label, path, onOpen }) => {
  const { t } = useTranslation();
  const displayPath = path || t('settings.dirNotConfigured');
  const openLabel = `${t('common.open')} ${label}`;

  return (
    <div className='opl-settings-row flex flex-col gap-8px md:flex-row md:items-center md:justify-between'>
      <div className='opl-settings-row__main text-14px text-t-primary'>{label}</div>
      <div className='opl-settings-row__meta flex min-w-0 items-center gap-8px md:max-w-520px'>
        <Tooltip content={displayPath} position='top'>
          <span className='min-w-0 flex-1 truncate text-12px text-t-secondary'>{displayPath}</span>
        </Tooltip>
        <Tooltip content={openLabel}>
          <Button
            type='text'
            aria-label={openLabel}
            icon={<FolderSearch theme='outline' size='18' />}
            disabled={!path}
            onClick={onOpen}
          />
        </Tooltip>
      </div>
    </div>
  );
};

const OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE = getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement;

const readOplFlowIntelligenceEnhancementPreference = (): boolean => {
  if (!OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) return false;
  return configService.get(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key) ?? true;
};

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

function developerCapabilityState(status: string): DeveloperCapabilityState {
  if (status === 'ready') return 'available';
  if (status === 'attention') return 'attention';
  return 'unavailable';
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

const SystemModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const appStateQuery = useOplAppState('fast');
  const appState = appStateQuery.appState;
  const appPaths = oplRecord(appState.paths);
  const workspacePath =
    oplString(appPaths.workspace_root_path) ??
    oplPathString(appPaths.workspace_root) ??
    oplPathString(appPaths.family_workspace_root) ??
    '';
  const logsPath = oplString(appPaths.logs_dir) ?? oplString(appPaths.logs_root) ?? oplString(appPaths.log_dir) ?? '';
  const developerProfileSettings = getOplDeveloperProfileSettings();
  const appDeveloperProfile = oplRecord(appState.developer_profile);
  const appDeveloperCapabilities = oplRecord(appDeveloperProfile.capabilities);
  const developerProfileState =
    oplString(appDeveloperProfile.profile_id) ??
    oplString(appDeveloperProfile.level) ??
    oplString(appDeveloperProfile.status) ??
    'unavailable';
  const developerProfileDisplayState = normalizeDeveloperProfileState(developerProfileState);
  const developerProfileCapabilities = developerProfileSettings.capability_axes
    .map((axis) => readDeveloperCapabilityDisplay(appDeveloperCapabilities[axis], axis))
    .filter((entry): entry is DeveloperCapabilityDisplay => Boolean(entry));

  const [developerDetailsOpen, setDeveloperDetailsOpen] = useState(false);
  const [oplFlowDetailsOpen, setOplFlowDetailsOpen] = useState(false);
  const [developerSettingsOpen, setDeveloperSettingsOpen] = useState(false);
  const [oplFlowIntelligenceEnhancementMode, setOplFlowIntelligenceEnhancementMode] = useState(
    readOplFlowIntelligenceEnhancementPreference
  );
  const [oplFlowIntelligenceEnhancementApplying, setOplFlowIntelligenceEnhancementApplying] = useState(false);

  useEffect(() => {
    if (!OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) return;
    const storedPreference = configService.get(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key);
    setOplFlowIntelligenceEnhancementMode(readOplFlowIntelligenceEnhancementPreference());
    ipcBridge.oplRuntime.executeAction
      .invoke({
        actionId: OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.status_action_id,
        dryRun: false,
      })
      .then((result) => {
        if (result.ok === false) return;
        const enabled = readIntelligenceEnhancementEnabled(result.parsed);
        if (enabled === null || storedPreference === false) return;
        setOplFlowIntelligenceEnhancementMode(enabled);
        configService.setLocal(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key, enabled);
      })
      .catch(() => {});
  }, []);

  const handleOplFlowIntelligenceEnhancementModeChange = useCallback(
    async (checked: boolean) => {
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
          throw new Error(result.error?.message || t('common.error'));
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
    },
    [appStateQuery.load, oplFlowIntelligenceEnhancementMode, t]
  );

  const handleOpenPath = useCallback((path: string) => {
    if (!path) return;
    void ipcBridge.shell.openFolderWith.invoke({ folder_path: path, tool: 'explorer' }).catch((caughtError) => {
      console.error('[SystemModalContent] Failed to open directory:', caughtError);
    });
  }, []);

  const oplFlowContext = oplRecord(appState.opl_flow_context);
  const oplFlowContextDisplay =
    oplString(oplFlowContext.flow_id) ?? oplString(oplFlowContext.contract_ref) ?? t('settings.unavailable');
  const oplFlowContextSource = oplString(oplFlowContext.source);

  return (
    <div className='opl-settings-page flex h-full w-full flex-col'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-14px'>
          <div className='opl-settings-page-header'>
            <div className='opl-settings-page-header__copy'>
              <div className='text-16px font-semibold text-t-primary leading-24px'>
                {t('settings.advancedSettings')}
              </div>
              <div className='mt-4px text-13px text-t-secondary leading-20px'>{t('settings.advancedPathsDesc')}</div>
            </div>
          </div>

          <section className='opl-settings-section'>
            <div className='opl-settings-section__header'>
              <div className='text-14px font-medium text-t-primary'>{t('settings.advancedPathsTitle')}</div>
            </div>
            <div className='opl-settings-list'>
              <ReadOnlyPathRow
                label={t('settings.workDir')}
                path={workspacePath}
                onOpen={() => handleOpenPath(workspacePath)}
              />
              <ReadOnlyPathRow label={t('settings.logDir')} path={logsPath} onOpen={() => handleOpenPath(logsPath)} />
            </div>
          </section>

          <section className='opl-settings-section'>
            <div
              className='opl-settings-section__header flex items-start justify-between gap-16px'
              data-testid='opl-developer-profile-row'
            >
              <div>
                <div className='text-14px font-medium text-t-primary'>{t(developerProfileSettings.label_key)}</div>
                <div className='mt-4px text-12px text-t-tertiary'>{t(developerProfileSettings.description_key)}</div>
              </div>
              <div className='opl-settings-row__meta'>
                <span
                  className='inline-flex rd-6px bg-fill-1 px-10px py-4px text-13px font-500 text-t-primary'
                  data-testid='opl-developer-profile-status'
                >
                  {developerProfileDisplayState === 'unavailable'
                    ? t('settings.unavailable')
                    : t(`settings.oplDeveloperProfileStates.${developerProfileDisplayState}`, {
                        defaultValue: t('settings.unavailable'),
                      })}
                </span>
              </div>
            </div>
            <div className='opl-settings-list'>
              {developerProfileCapabilities.map((capability) => {
                const state = developerCapabilityState(capability.status);
                return (
                  <div
                    key={capability.id}
                    className='opl-settings-row flex items-center justify-between gap-16px'
                    data-testid={`opl-developer-capability-${capability.id}`}
                  >
                    <div className='opl-settings-row__main text-14px text-t-primary'>
                      {t(`settings.oplDeveloperCapabilities.${capability.id}`)}
                    </div>
                    <div className='opl-settings-row__meta'>
                      <Tag color={state === 'attention' ? 'orange' : state === 'unavailable' ? 'red' : 'gray'}>
                        {t(`settings.oplDeveloperCapabilityStates.${state}`)}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </div>
            <details
              className='opl-settings-details mt-12px'
              onToggle={(event) => setDeveloperDetailsOpen(event.currentTarget.open)}
              data-testid='opl-developer-profile-details'
            >
              <summary className='cursor-pointer text-13px text-t-secondary'>{t('common.technical_details')}</summary>
              {developerDetailsOpen && (
                <div className='mt-8px space-y-6px text-12px text-t-secondary'>
                  <div className='break-words'>{developerProfileState}</div>
                  {developerProfileCapabilities.map((capability) => (
                    <div key={capability.id} className='break-words'>
                      {capability.id}: {capability.level} ({capability.status})
                    </div>
                  ))}
                </div>
              )}
            </details>
          </section>

          <section className='opl-settings-section'>
            <details
              className='opl-settings-details'
              onToggle={(event) => setOplFlowDetailsOpen(event.currentTarget.open)}
              data-testid='opl-flow-details'
            >
              <summary className='cursor-pointer text-14px font-medium text-t-primary'>
                {t('settings.oplFlowContext')}
              </summary>
              {oplFlowDetailsOpen && (
                <div className='opl-settings-list mt-10px'>
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
                  <PreferenceRow
                    label={t('settings.oplFlowContext')}
                    description={t('settings.oplFlowContextDesc')}
                    testId='opl-flow-context-row'
                  >
                    <div className='max-w-320px text-right text-12px text-t-secondary'>
                      <div className='truncate font-500 text-t-primary'>{oplFlowContextDisplay}</div>
                      {oplFlowContextSource && <div className='truncate'>{oplFlowContextSource}</div>}
                    </div>
                  </PreferenceRow>
                </div>
              )}
            </details>
          </section>

          <section className='opl-settings-section'>
            <details
              className='opl-settings-details'
              onToggle={(event) => setDeveloperSettingsOpen(event.currentTarget.open)}
              data-testid='developer-settings-details'
            >
              <summary className='cursor-pointer text-14px font-medium text-t-primary'>
                {t('settings.devTools')}
              </summary>
              {developerSettingsOpen && (
                <div className='mt-10px'>
                  <DevSettings />
                </div>
              )}
            </details>
          </section>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
