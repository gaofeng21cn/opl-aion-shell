/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  isOplCodexCliFixedExecutor,
} from '@/common/config/oplProductProfile';
import type { IMcpServer } from '@/common/config/storage';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
} from '@/renderer/components/chat/MobileActionSheet';
import ComposerCapabilityPalette, {
  type ComposerCapabilityPaletteGroup,
  type ComposerCapabilityPaletteItem,
} from '@/renderer/components/chat/composer/ComposerCapabilityPalette';
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import {
  filterNonPermissionAccessModes,
  supportsModeSwitch,
  type AgentModeOption,
} from '@/renderer/utils/model/agentModes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import type { AcpModelInfo, AvailableAgent } from '../types';
import { isGuidSkillChecked, type GuidSkillMenuItem } from '../utils/assistantSkillMenu';
import { resolveOplPackageLaunchGate, type OplHomeAssistant } from '../utils/oplHomeAssistants';
import PresetAgentTag, { type AgentSwitcherItem } from './PresetAgentTag';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from '../index.module.css';

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;
  fileAccessDisabled?: boolean;
  fileAccessDisabledReason?: string;

  // Model selector node (rendered by parent)
  modelSelectorNode: React.ReactNode;
  mobileCodexModelSelection?: GuidMobileCodexModelSelection;
  activeCapabilityId?: string;
  activeCapabilityLabel?: string;
  onSelectCapability?: (assistantId: string) => void;

  // Agent mode
  selectedAgent: string | 'custom';
  effectiveModeAgent?: string;
  selectedMode: string;
  onModeSelect: (mode: string) => void;

  // Preset agent tag
  is_presetAgent: boolean;
  selectedAgentInfo: AvailableAgent | undefined;
  /**
   * Backend-merged preset catalog — drives the preset tag label lookup. Not
   * the ACP engine-config list (custom agents from the AgentRegistry).
   */
  assistants: OplHomeAssistant[];
  localeKey: string;
  onClosePresetTag: () => void;
  agentLogo?: string | null;
  agentSwitcherItems?: AgentSwitcherItem[];
  onAgentSwitch?: (key: string) => void;
  hidePresetTag?: boolean;
  showModeSelector?: boolean;

  // Skills management
  allSkills: GuidSkillMenuItem[];
  disabledBuiltinSkills: string[];
  enabledSkills: string[];
  onToggleSkill: (name: string, isAuto: boolean) => void;
  mcpServers: IMcpServer[];
  selectedMcpServerIds: string[];
  onToggleMcpServer: (serverId: string) => void;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

type GuidMobileCodexModelSelection = {
  modelInfo: AcpModelInfo | null;
  selectedModelId: string | null;
  selectedReasoningEffort: string | null;
  onChange: (modelId: string | null, reasoningEffort: string | null) => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  fileAccessDisabled = false,
  fileAccessDisabledReason,
  modelSelectorNode,
  mobileCodexModelSelection,
  activeCapabilityId,
  activeCapabilityLabel,
  onSelectCapability,
  selectedAgent,
  effectiveModeAgent,
  selectedMode,
  onModeSelect,
  is_presetAgent,
  selectedAgentInfo,
  assistants,
  localeKey,
  onClosePresetTag,
  agentLogo,
  agentSwitcherItems,
  onAgentSwitch,
  allSkills,
  disabledBuiltinSkills,
  enabledSkills,
  onToggleSkill,
  mcpServers,
  selectedMcpServerIds,
  onToggleMcpServer,
  hidePresetTag = false,
  showModeSelector = true,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const modeBackend = effectiveModeAgent || selectedAgent;
  const availableAgentModes = useAgentModesForBackend(modeBackend);
  const { appState } = useOplAppState('fast');
  const sessionModes = useMemo(() => filterNonPermissionAccessModes(availableAgentModes), [availableAgentModes]);
  const showModeSwitch = showModeSelector && supportsModeSwitch(modeBackend);
  const showMobileModeSwitch = showModeSelector && availableAgentModes.length > 0;
  const configOptionCount = (modelSelectorNode ? 1 : 0) + (showModeSwitch ? 1 : 0);

  // Browser file picker ref (WebUI only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList);
        if (processed.length > 0) {
          onFilesUploaded(processed.map((f) => f.path));
        }
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onFilesUploaded, t]
  );

  const getModeDisplayLabel = useCallback(
    (mode: AgentModeOption): string => t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
    [t]
  );

  const isWebUI = !isElectronDesktop();

  const { openFileSelector, openDirectorySelector } = useOpenFileSelector({
    onFilesSelected: onFilesUploaded,
  });

  const openHostFilePicker = useCallback(() => {
    if (fileAccessDisabled) return;
    openFileSelector();
  }, [fileAccessDisabled, openFileSelector]);

  const openHostDirectoryPicker = useCallback(() => {
    if (fileAccessDisabled) return;
    openDirectorySelector();
  }, [fileAccessDisabled, openDirectorySelector]);

  const paletteGroups = useMemo<ComposerCapabilityPaletteGroup[]>(() => {
    const addItems: ComposerCapabilityPaletteItem[] = [
      {
        id: 'attach-file',
        label: t('guid.context.attachFile'),
        description: fileAccessDisabled ? fileAccessDisabledReason : t('common.fileAttach.addFilesDescription'),
        icon: <OplIcon name='paperclip' />,
        disabled: fileAccessDisabled || uploading,
        onSelect: openHostFilePicker,
      },
      {
        id: 'attach-directory',
        label: t('guid.context.attachDirectory'),
        description: fileAccessDisabled ? fileAccessDisabledReason : t('common.fileAttach.addFolderDescription'),
        icon: <OplIcon name='folderOpen' />,
        disabled: fileAccessDisabled || uploading,
        onSelect: openHostDirectoryPicker,
      },
    ];

    if (isWebUI) {
      addItems.push({
        id: 'attach-device',
        label: t('common.fileAttach.myDevice'),
        description: fileAccessDisabled ? fileAccessDisabledReason : undefined,
        icon: <OplIcon name='paperclip' />,
        disabled: fileAccessDisabled || uploading,
        onSelect: () => fileInputRef.current?.click(),
      });
    }

    const agentPackageItems: ComposerCapabilityPaletteItem[] = [];
    assistants
      .filter(() => Boolean(onSelectCapability))
      .forEach((assistant) => {
        const launchGate = resolveOplPackageLaunchGate(appState, assistant.opl_package_id);
        agentPackageItems.push({
          id: `agent-${assistant.id}`,
          label: assistant.name_i18n?.[localeKey] || assistant.name,
          description: assistant.description_i18n?.[localeKey] || assistant.description,
          icon: <OplIcon name='sparkle' />,
          active: Boolean(activeCapabilityId) && activeCapabilityId === assistant.opl_shortcut_id,
          disabled: launchGate.state === 'package_unavailable',
          onSelect: () => onSelectCapability?.(assistant.opl_shortcut_id),
        });
      });

    if (agentPackageItems.length === 0) {
      agentPackageItems.push({
        id: 'manage-agents',
        label: t('guid.context.manageAgents'),
        description: t('guid.context.noAgentPackages'),
        icon: <OplIcon name='sparkle' />,
        onSelect: () => void navigate('/settings/agents'),
      });
    }

    const skillItems: ComposerCapabilityPaletteItem[] = [];
    if (allSkills.length > 0) {
      allSkills.forEach((skill) => {
        skillItems.push({
          id: `skill-${skill.name}`,
          label: skill.name,
          description: skill.description,
          keywords: ['skill', skill.description],
          icon: <OplIcon name='skill' />,
          active: isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills),
          disabled: skill.locked,
          closeOnSelect: false,
          onSelect: () => onToggleSkill(skill.name, skill.isAuto),
        });
      });
    } else {
      skillItems.push({
        id: 'manage-skills',
        label: t('guid.context.manageSkills'),
        description: t('guid.context.noSelectableSkills'),
        icon: <OplIcon name='skill' />,
        onSelect: () => void navigate('/settings/capabilities?tab=skills'),
      });
    }

    const connectionItems: ComposerCapabilityPaletteItem[] = [];
    if (mcpServers.length > 0) {
      mcpServers.forEach((server) => {
        connectionItems.push({
          id: `connection-${server.id}`,
          label: server.name,
          description: server.description || undefined,
          keywords: ['connection', 'app'],
          icon: <OplIcon name='link' />,
          active: selectedMcpServerIds.includes(server.id),
          closeOnSelect: false,
          onSelect: () => onToggleMcpServer(server.id),
        });
      });
    } else {
      connectionItems.push({
        id: 'manage-connections',
        label: t('guid.context.manageConnections'),
        description: t('guid.context.noConnections'),
        icon: <OplIcon name='link' />,
        onSelect: () => void navigate('/settings/capabilities?tab=tools'),
      });
    }

    const sessionModeItems: ComposerCapabilityPaletteItem[] = [];
    if (showModeSelector) {
      sessionModes.forEach((mode) => {
        sessionModeItems.push({
          id: `mode-${mode.value}`,
          label: getModeDisplayLabel(mode),
          description: mode.description,
          icon: <OplIcon name='permission' />,
          active: selectedMode === mode.value,
          closeOnSelect: false,
          onSelect: () => onModeSelect(mode.value),
        });
      });
    }

    const groups: ComposerCapabilityPaletteGroup[] = [
      { id: 'local_inputs', label: t('guid.context.localInputsGroup'), items: addItems },
      { id: 'agent_packages', label: t('guid.context.agentPackagesGroup'), items: agentPackageItems },
      { id: 'skills', label: t('guid.context.skillsGroup'), items: skillItems },
    ];
    if (sessionModeItems.length > 0) {
      groups.push({ id: 'session_modes', label: t('guid.context.sessionModesGroup'), items: sessionModeItems });
    }
    groups.push({
      id: 'apps_and_connections',
      label: t('guid.context.appsAndConnectionsGroup'),
      items: connectionItems,
    });
    return groups;
  }, [
    activeCapabilityId,
    allSkills,
    appState,
    assistants,
    disabledBuiltinSkills,
    enabledSkills,
    fileAccessDisabled,
    fileAccessDisabledReason,
    getModeDisplayLabel,
    isWebUI,
    localeKey,
    mcpServers,
    navigate,
    onModeSelect,
    onSelectCapability,
    onToggleMcpServer,
    onToggleSkill,
    openHostDirectoryPicker,
    openHostFilePicker,
    selectedMcpServerIds,
    selectedMode,
    sessionModes,
    showModeSelector,
    t,
    uploading,
  ]);

  const mobileSheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const entries: MobileActionSheetEntry[] = [];
    const localInputGroup = paletteGroups.find((group) => group.id === 'local_inputs');
    localInputGroup?.items.forEach((item) => {
      entries.push({
        key: item.id,
        icon: item.icon,
        label: item.label,
        description: item.description,
        disabled: item.disabled,
        onClick: item.onSelect,
      });
    });

    const groupIcons: Record<string, React.ReactNode> = {
      agent_packages: <OplIcon name='sparkle' />,
      skills: <OplIcon name='skill' />,
      session_modes: <OplIcon name='permission' />,
      apps_and_connections: <OplIcon name='link' />,
    };
    paletteGroups
      .filter((group) => group.id !== 'local_inputs')
      .forEach((group) => {
        const enabledItems = group.items.filter((item) => !item.disabled);
        if (enabledItems.length === 0) return;
        const options: MobileActionSheetOption[] = enabledItems.map((item) => ({
          key: item.id,
          label: item.label,
          description: item.description,
          active: item.active,
        }));
        entries.push({
          key: `capability-${group.id}`,
          icon: groupIcons[group.id],
          label: group.label,
          meta: group.items.filter((item) => item.active).length || undefined,
          submenu: {
            title: group.label,
            options,
            selectable: group.id === 'agent_packages' || group.id === 'session_modes',
            onSelect: (itemId) => enabledItems.find((item) => item.id === itemId)?.onSelect(),
          },
        });
      });

    const sessionModeValues = new Set(sessionModes.map((mode) => mode.value));
    const permissionModes = availableAgentModes.filter((mode) => !sessionModeValues.has(mode.value));
    if (showMobileModeSwitch && permissionModes.length > 0) {
      const permissionOptions: MobileActionSheetOption[] = permissionModes.map((mode) => ({
        key: mode.value,
        label: getModeDisplayLabel(mode),
        description: mode.description,
        active: selectedMode === mode.value,
      }));
      entries.push({
        key: 'permission',
        icon: <OplIcon name='permission' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: permissionOptions.find((option) => option.active)?.label,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: permissionOptions,
          onSelect: onModeSelect,
        },
      });
    }

    if (mobileCodexModelSelection && modeBackend === 'codex' && isOplCodexCliFixedExecutor()) {
      const { modelInfo, selectedModelId, selectedReasoningEffort, onChange } = mobileCodexModelSelection;
      if (modelInfo?.available_models.length) {
        const modelLocale: OplModelDisplayLocale = localeKey.startsWith('en') ? 'en-US' : 'zh-CN';
        const autoSelection = selectedModelId === null ? resolveOplCodexAutoSelection(modelInfo) : null;
        const reasoningEffort =
          selectedReasoningEffort ?? autoSelection?.reasoningEffort ?? getOplDefaultCodexReasoningEffort();
        const effectiveModelId = selectedModelId ?? autoSelection?.modelId ?? modelInfo.current_model_id;
        const effectiveModel = modelInfo.available_models.find((model) => model.id === effectiveModelId);
        const autoDisplay = buildOplCodexAutoModelOption({ modelInfo, localeKey: modelLocale });
        const reasoningTitle =
          modelLocale === 'en-US'
            ? getOplCodexModelDisplayOptions().reasoning_menu_title_en
            : getOplCodexModelDisplayOptions().reasoning_menu_title_zh;
        const reasoningOptions: MobileActionSheetOption[] =
          getOplCodexModelDisplayOptions().user_reasoning_effort_options.map((effort) => ({
            key: effort,
            label: formatOplCodexReasoningMenuLabel(effort, modelLocale),
            active: reasoningEffort === effort,
          }));
        const modelOptions: MobileActionSheetOption[] = [
          {
            key: '__auto',
            label: autoDisplay.label,
            description: autoDisplay.description,
            active: selectedModelId === null,
          },
          ...modelInfo.available_models.map((model) => {
            const display = formatOplCodexModelDisplay({
              id: model.id,
              label: model.label,
              reasoningEffort,
              localeKey: modelLocale,
            });
            return {
              key: model.id,
              label: display.modelLabel,
              description: display.description,
              active: selectedModelId === model.id,
            };
          }),
        ];
        const currentModelLabel = effectiveModel
          ? formatOplCodexModelDisplay({
              id: effectiveModel.id,
              label: effectiveModel.label,
              reasoningEffort,
              localeKey: modelLocale,
            }).modelLabel
          : (modelInfo.current_model_label ?? modelInfo.current_model_id ?? undefined);

        entries.push({
          key: 'model',
          label: t('common.model', { defaultValue: 'Model' }),
          meta: currentModelLabel,
          submenu: {
            title: t('common.model', { defaultValue: 'Model' }),
            options: modelOptions,
            onSelect: (modelId) => {
              if (modelId === '__auto') onChange(null, null);
              else onChange(modelId, reasoningEffort);
            },
          },
        });
        entries.push({
          key: 'reasoning',
          label: reasoningTitle,
          meta: formatOplCodexReasoningMenuLabel(reasoningEffort, modelLocale),
          submenu: {
            title: reasoningTitle,
            options: reasoningOptions,
            onSelect: (effort) => onChange(effectiveModelId, effort),
          },
        });
        entries.push({
          key: 'reset-session-defaults',
          label: t('agent.sessionConfiguration.resetDefaults'),
          trailingIcon: <OplIcon name='refresh' aria-hidden='true' />,
          dividerBefore: true,
          onClick: () => onChange(null, null),
        });
      }
    }

    if (activeCapabilityLabel) {
      entries.push({
        key: 'active-capability',
        icon: <OplIcon name='sparkle' />,
        label: t('guid.home.activeCapability', { capability: activeCapabilityLabel }),
        variant: 'muted',
        dividerBefore: entries.length > 0,
        disabled: true,
      });
    }

    return entries;
  }, [
    activeCapabilityLabel,
    availableAgentModes,
    getModeDisplayLabel,
    isMobile,
    localeKey,
    mobileCodexModelSelection,
    modeBackend,
    onModeSelect,
    paletteGroups,
    selectedMode,
    sessionModes,
    showMobileModeSwitch,
    t,
  ]);

  const contextEntry = (
    <span className='flex cursor-pointer items-center gap-4px lh-[1]'>
      <Button
        type='secondary'
        shape='circle'
        className={isPaletteOpen ? styles.plusButtonRotate : ''}
        icon={<OplIcon name='plus' />}
        data-testid='file-upload-btn'
        aria-label={t('guid.context.addContext')}
        aria-expanded={isPaletteOpen}
      />
      {files.length > 0 && (
        <Tooltip
          className={'!max-w-max'}
          content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
        >
          <span className='text-t-primary'>{t('conversation.commandQueue.files', { count: files.length })}</span>
        </Tooltip>
      )}
    </span>
  );

  return (
    <>
      <div className={styles.actionRow} data-testid='guid-action-row'>
        <div className={styles.actionTools}>
          <div className={styles.actionEntry}>
            {isMobile ? (
              <span className='flex items-center gap-4px lh-[1]'>
                <Button
                  type='secondary'
                  shape='circle'
                  icon={<OplIcon name='plus' />}
                  data-testid='file-upload-btn'
                  aria-label={t('guid.context.addContext')}
                  aria-expanded={isMobileSheetOpen}
                  onClick={() => setIsMobileSheetOpen(true)}
                />
                {files.length > 0 ? (
                  <Tooltip
                    className='!max-w-max'
                    content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                  >
                    <span className='text-t-primary'>
                      {t('conversation.commandQueue.files', { count: files.length })}
                    </span>
                  </Tooltip>
                ) : null}
              </span>
            ) : (
              <ComposerCapabilityPalette
                open={isPaletteOpen}
                onOpenChange={setIsPaletteOpen}
                trigger={contextEntry}
                title={t('guid.context.paletteTitle')}
                searchPlaceholder={t('guid.context.searchPalette')}
                noResultsText={t('guid.context.noPaletteResults')}
                groups={paletteGroups}
                horizontalOffset={-8}
                testId='guid-capability-palette'
              />
            )}
            {isWebUI && (
              <input
                ref={fileInputRef}
                type='file'
                multiple
                style={{ display: 'none' }}
                onChange={handleLocalFileChange}
              />
            )}
          </div>

          {fileAccessDisabled ? (
            <span className='sr-only' data-testid='opl-guid-file-access-disabled'>
              {fileAccessDisabledReason}
            </span>
          ) : null}
        </div>
        {isMobile ? (
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('guid.context.addContext')}
            entries={mobileSheetEntries}
          />
        ) : null}
        <div className={styles.actionSubmit} data-testid='guid-action-submit'>
          {!isMobile && configOptionCount > 0 && (
            <div
              className={styles.actionConfigGroup}
              data-mobile={isMobile ? 'true' : undefined}
              data-permission-mode={selectedMode}
            >
              {modelSelectorNode}

              {showModeSwitch && (
                <AgentModeSelector
                  backend={modeBackend}
                  compact
                  initialMode={selectedMode}
                  onModeSelect={onModeSelect}
                  compactLeadingIcon={<OplIcon name='permission' size={14} />}
                  modeLabelFormatter={getModeDisplayLabel}
                />
              )}
            </div>
          )}

          {!hidePresetTag && is_presetAgent && selectedAgentInfo && (
            <div className={styles.actionPresetAgent}>
              <PresetAgentTag
                agentInfo={selectedAgentInfo}
                assistants={assistants}
                localeKey={localeKey}
                onClose={onClosePresetTag}
                agentLogo={agentLogo}
                agentSwitcherItems={agentSwitcherItems}
                onAgentSwitch={onAgentSwitch}
              />
            </div>
          )}

          {speechInputNode}
          <Button
            shape='circle'
            type='primary'
            loading={loading}
            disabled={isButtonDisabled}
            className='send-button-custom'
            icon={<OplIcon name='send' />}
            onClick={onSend}
            data-testid='guid-send-btn'
            aria-label={t('common.send', { defaultValue: 'Send' })}
          />
        </div>
      </div>
    </>
  );
};

export default GuidActionRow;
