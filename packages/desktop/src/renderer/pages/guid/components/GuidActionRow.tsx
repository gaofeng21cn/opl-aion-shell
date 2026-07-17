/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
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
  useAttachEntry,
} from '@/renderer/components/chat/MobileActionSheet';
import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace';
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import { supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { getCleanFileNames, FileService } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import type { AcpModelInfo, AvailableAgent } from '../types';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { isGuidSkillChecked, type GuidSkillMenuItem } from '../utils/assistantSkillMenu';
import PresetAgentTag, { type AgentSwitcherItem } from './PresetAgentTag';
import GuidWorkspaceManagementModal from './GuidWorkspaceManagementModal';
import { Button, Checkbox, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import {
  ArrowUp,
  CheckSmall,
  CloseSmall,
  FolderOpen,
  Lightning,
  Link,
  MagicHat,
  Paperclip,
  Plus,
  Shield,
} from '@icon-park/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidMobileCodexModelSelection = {
  modelInfo: AcpModelInfo | null;
  selectedModelId: string | null;
  selectedReasoningEffort: string | null;
  onChange: (modelId: string | null, reasoningEffort: string | null) => void;
};

type GuidActionRowProps = {
  // File handling
  files: string[];
  onFilesUploaded: (paths: string[]) => void;
  fileAccessDisabled?: boolean;
  fileAccessDisabledReason?: string;

  // Model selector node (rendered by parent)
  modelSelectorNode: React.ReactNode;
  mobileCodexModelSelection?: GuidMobileCodexModelSelection;
  activeCapabilityLabel?: string;

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
  assistants: Assistant[];
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

  // New-session working directory
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
  workspaceAccessDisabled?: boolean;
  workspaceAccessDisabledReason?: string;

  // Send button
  loading: boolean;
  isButtonDisabled: boolean;
  speechInputNode?: React.ReactNode;
  onSend: () => void;
};

const GuidActionRow: React.FC<GuidActionRowProps> = ({
  files,
  onFilesUploaded,
  fileAccessDisabled = false,
  fileAccessDisabledReason,
  modelSelectorNode,
  mobileCodexModelSelection,
  activeCapabilityLabel,
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
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  workspaceAccessDisabled = false,
  workspaceAccessDisabledReason,
  hidePresetTag = false,
  showModeSelector = true,
  loading,
  isButtonDisabled,
  speechInputNode,
  onSend,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isWorkspaceManagementOpen, setIsWorkspaceManagementOpen] = useState(false);
  const modeBackend = effectiveModeAgent || selectedAgent;
  const availableAgentModes = useAgentModesForBackend(modeBackend);
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

  const openWorkspacePicker = useCallback(() => {
    if (workspaceAccessDisabled) return;
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((directories) => {
        const selectedDirectory = directories?.[0];
        if (!selectedDirectory) return;
        addRecentWorkspace(selectedDirectory);
        onSelectWorkspace(selectedDirectory);
      })
      .catch((error) => {
        console.error('Failed to open workspace directory dialog:', error);
      });
  }, [onSelectWorkspace, workspaceAccessDisabled]);

  const handleMobileFilesAdded = useCallback(
    (items: Array<{ path: string }>) => {
      onFilesUploaded(items.map((item) => item.path));
    },
    [onFilesUploaded]
  );
  const { entries: mobileAttachEntries, hiddenFileInput: mobileAttachHiddenInput } = useAttachEntry({
    openFileSelector: openHostFilePicker,
    openDirectorySelector: openHostDirectoryPicker,
    directoryLabel: t('guid.context.attachDirectory'),
    onLocalFilesAdded: handleMobileFilesAdded,
  });

  const isSkillChecked = (skill: GuidSkillMenuItem) => isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills);

  const activeSkillCount = allSkills.filter(isSkillChecked).length;
  const activeMcpCount = selectedMcpServerIds.length;
  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';
  const recentWorkspaces = getRecentWorkspaces();

  const mobileSheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const entries: MobileActionSheetEntry[] = mobileAttachEntries.map((entry) => ({
      ...entry,
      disabled: fileAccessDisabled,
      description: fileAccessDisabled ? fileAccessDisabledReason : entry.description,
      dividerBefore: false,
    }));

    const workspaceOptions: MobileActionSheetOption[] = [
      {
        key: 'choose',
        label: t('guid.context.chooseWorkingDirectory'),
      },
    ];
    if (recentWorkspaces.length > 0) {
      workspaceOptions.push({
        key: 'manage',
        label: t('guid.workspace.manageRegistered'),
      });
    }
    if (workspaceDir) {
      workspaceOptions.push({
        key: 'clear',
        label: t('guid.context.clearWorkingDirectory'),
      });
    }
    entries.push({
      key: 'workspace',
      icon: <FolderOpen theme='outline' size='16' />,
      label: t('guid.context.workingDirectory'),
      meta: workspaceName || undefined,
      description: workspaceAccessDisabled ? workspaceAccessDisabledReason : undefined,
      disabled: workspaceAccessDisabled,
      submenu: {
        title: t('guid.context.workingDirectory'),
        options: workspaceOptions,
        selectable: false,
        onSelect: (key) => {
          if (key === 'choose') {
            openWorkspacePicker();
          } else if (key === 'manage') {
            setIsWorkspaceManagementOpen(true);
          } else if (key === 'clear') {
            onClearWorkspace();
          }
        },
      },
    });

    const mobileSkillOptions: MobileActionSheetOption[] = allSkills
      .map((skill, index) => ({ skill, index }))
      .filter(({ skill }) => !skill.locked)
      .map(({ skill, index }) => {
        const checked = isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills);
        return {
          key: String(index),
          label: (
            <span className='flex min-w-0 items-center justify-between gap-8px'>
              <span className='truncate'>{skill.name}</span>
              {checked ? <CheckSmall theme='outline' size='16' className='shrink-0' /> : null}
            </span>
          ),
          description: skill.description || undefined,
        };
      });
    entries.push({
      key: 'skills',
      icon: <Lightning theme='outline' size='16' />,
      label: t('guid.context.skills'),
      meta: `${activeSkillCount}/${allSkills.length}`,
      submenu: {
        title: t('guid.context.skills'),
        options: mobileSkillOptions,
        emptyText: t('guid.context.noSelectableSkills'),
        selectable: false,
        onSelect: (key) => {
          const skill = allSkills[Number(key)];
          if (skill && !skill.locked) {
            onToggleSkill(skill.name, skill.isAuto);
          }
        },
      },
    });

    const connectionOptions: MobileActionSheetOption[] = mcpServers.map((server) => ({
      key: server.id,
      label: (
        <span className='flex min-w-0 items-center justify-between gap-8px'>
          <span className='truncate'>{server.name}</span>
          {selectedMcpServerIds.includes(server.id) ? (
            <CheckSmall theme='outline' size='16' className='shrink-0' />
          ) : null}
        </span>
      ),
      description: server.description || undefined,
    }));
    entries.push({
      key: 'connections',
      icon: <Link theme='outline' size='16' />,
      label: t('guid.context.connections'),
      meta: `${activeMcpCount}/${mcpServers.length}`,
      submenu: {
        title: t('guid.context.connections'),
        options: connectionOptions,
        emptyText: t('guid.context.noConnections'),
        selectable: false,
        onSelect: onToggleMcpServer,
      },
    });

    const modeOptions: MobileActionSheetOption[] = showMobileModeSwitch
      ? availableAgentModes.map((mode) => ({
          key: mode.value,
          label: getModeDisplayLabel(mode),
          description: mode.description,
          active: selectedMode === mode.value,
        }))
      : [];

    if (modeOptions.length > 0) {
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: modeOptions.find((option) => option.active)?.label,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
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
        const modelOptions: MobileActionSheetOption[] = modelInfo.available_models.map((model) => {
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
        });
        const currentModelLabel = effectiveModel
          ? formatOplCodexModelDisplay({
              id: effectiveModel.id,
              label: effectiveModel.label,
              reasoningEffort,
              localeKey: modelLocale,
            }).modelLabel
          : (modelInfo.current_model_label ?? modelInfo.current_model_id ?? undefined);

        entries.push({
          key: 'auto',
          icon: <MagicHat theme='outline' size='16' />,
          label: autoDisplay.label,
          description: autoDisplay.description,
          onClick: () => onChange(null, null),
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
          key: 'model',
          label: t('common.model', { defaultValue: 'Model' }),
          meta: currentModelLabel,
          submenu: {
            title: t('common.model', { defaultValue: 'Model' }),
            options: modelOptions,
            onSelect: (modelId) => onChange(modelId, reasoningEffort),
          },
        });
      }
    }

    if (activeCapabilityLabel) {
      entries.push({
        key: 'active-capability',
        icon: <MagicHat theme='outline' size='16' />,
        label: t('guid.home.activeCapability', { capability: activeCapabilityLabel }),
        variant: 'muted',
        dividerBefore: entries.length > 0,
        disabled: true,
      });
    }

    return entries;
  }, [
    activeCapabilityLabel,
    activeMcpCount,
    activeSkillCount,
    allSkills,
    availableAgentModes,
    disabledBuiltinSkills,
    enabledSkills,
    fileAccessDisabled,
    fileAccessDisabledReason,
    getModeDisplayLabel,
    isMobile,
    localeKey,
    mobileAttachEntries,
    mobileCodexModelSelection,
    modeBackend,
    mcpServers,
    onClearWorkspace,
    onModeSelect,
    onToggleMcpServer,
    onToggleSkill,
    openWorkspacePicker,
    recentWorkspaces.length,
    selectedMcpServerIds,
    selectedMode,
    showMobileModeSwitch,
    t,
    workspaceAccessDisabled,
    workspaceAccessDisabledReason,
    workspaceDir,
    workspaceName,
  ]);

  const menuContent = (
    <Menu
      className='min-w-220px'
      onClickMenuItem={(key) => {
        if (key === 'attach-file') {
          openHostFilePicker();
        } else if (key === 'attach-directory') {
          openHostDirectoryPicker();
        } else if (key === 'attach-device') {
          fileInputRef.current?.click();
        } else if (key === 'workspace-choose') {
          openWorkspacePicker();
        } else if (key === 'workspace-manage') {
          setIsWorkspaceManagementOpen(true);
        } else if (key === 'workspace-clear') {
          onClearWorkspace();
        } else if (key.startsWith('skill:')) {
          const skill = allSkills[Number(key.slice('skill:'.length))];
          if (skill && !skill.locked) {
            onToggleSkill(skill.name, skill.isAuto);
          }
        } else if (key.startsWith('connection:')) {
          const server = mcpServers[Number(key.slice('connection:'.length))];
          if (server) {
            onToggleMcpServer(server.id);
          }
        }
      }}
    >
      <Menu.Item key='attach-file' disabled={fileAccessDisabled || uploading}>
        <div className='flex items-center gap-8px'>
          <Paperclip theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
          <span>{t('guid.context.attachFile')}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='attach-directory' disabled={fileAccessDisabled || uploading}>
        <div className='flex items-center gap-8px'>
          <FolderOpen theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
          <span>{t('guid.context.attachDirectory')}</span>
        </div>
      </Menu.Item>
      {isWebUI ? (
        <Menu.Item key='attach-device' disabled={fileAccessDisabled || uploading}>
          <div className='flex items-center gap-8px'>
            <Paperclip theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
            <span>{t('common.fileAttach.myDevice')}</span>
          </div>
        </Menu.Item>
      ) : null}

      <Menu.SubMenu
        key='workspace'
        title={
          <div className='flex items-center gap-8px'>
            <FolderOpen theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
            <span>{t('guid.context.workingDirectory')}</span>
          </div>
        }
      >
        {workspaceAccessDisabled ? (
          <Menu.Item key='workspace-disabled' disabled>
            <span className='text-12px text-t-secondary'>{workspaceAccessDisabledReason}</span>
          </Menu.Item>
        ) : (
          <>
            {workspaceDir ? (
              <Menu.Item key='workspace-current' disabled>
                <div className='flex min-w-0 items-center gap-8px'>
                  <CheckSmall theme='outline' size='16' className='shrink-0 leading-none' />
                  <span className='truncate' title={workspaceDir}>
                    {workspaceName}
                  </span>
                </div>
              </Menu.Item>
            ) : null}
            <Menu.Item key='workspace-choose'>
              <span>{t('guid.context.chooseWorkingDirectory')}</span>
            </Menu.Item>
            {recentWorkspaces.length > 0 ? (
              <Menu.Item key='workspace-manage'>
                <span>{t('guid.workspace.manageRegistered')}</span>
              </Menu.Item>
            ) : null}
            {workspaceDir ? (
              <Menu.Item key='workspace-clear'>
                <div className='flex items-center gap-8px'>
                  <CloseSmall theme='outline' size='16' className='leading-none' />
                  <span>{t('guid.context.clearWorkingDirectory')}</span>
                </div>
              </Menu.Item>
            ) : null}
          </>
        )}
      </Menu.SubMenu>

      <Menu.SubMenu
        key='skills'
        title={
          <div className='flex items-center gap-8px'>
            <Lightning theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
            <span>
              {t('guid.context.skills')} ({activeSkillCount}/{allSkills.length})
            </span>
          </div>
        }
        triggerProps={{ popupStyle: { maxHeight: 360, overflowY: 'auto', overflowX: 'hidden' } }}
      >
        {allSkills.length > 0 ? (
          allSkills.map((skill, index) => (
            <Menu.Item key={`skill:${index}`} disabled={skill.locked}>
              <Checkbox
                checked={isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills)}
                disabled={skill.locked}
                onClick={(event: React.MouseEvent) => event.stopPropagation()}
                onChange={() => {
                  if (!skill.locked) onToggleSkill(skill.name, skill.isAuto);
                }}
              >
                <span className='text-13px'>{skill.name}</span>
              </Checkbox>
            </Menu.Item>
          ))
        ) : (
          <Menu.Item key='skills-empty' disabled>
            <span className='text-12px text-t-secondary'>{t('guid.context.noSelectableSkills')}</span>
          </Menu.Item>
        )}
      </Menu.SubMenu>

      <Menu.SubMenu
        key='connections'
        title={
          <div className='flex items-center gap-8px'>
            <Link theme='outline' size='16' fill={iconColors.secondary} className='leading-none' />
            <span>
              {t('guid.context.connections')} ({activeMcpCount}/{mcpServers.length})
            </span>
          </div>
        }
        triggerProps={{ popupStyle: { maxHeight: 360, overflowY: 'auto', overflowX: 'hidden' } }}
      >
        {mcpServers.length > 0 ? (
          mcpServers.map((server, index) => (
            <Menu.Item key={`connection:${index}`}>
              <Checkbox
                checked={selectedMcpServerIds.includes(server.id)}
                onClick={(event: React.MouseEvent) => event.stopPropagation()}
                onChange={() => onToggleMcpServer(server.id)}
              >
                <span className='text-13px'>{server.name}</span>
              </Checkbox>
            </Menu.Item>
          ))
        ) : (
          <Menu.Item key='connections-empty' disabled>
            <span className='text-12px text-t-secondary'>{t('guid.context.noConnections')}</span>
          </Menu.Item>
        )}
      </Menu.SubMenu>
    </Menu>
  );

  const contextEntry = (
    <span className='flex cursor-pointer items-center gap-4px lh-[1]'>
      <Button
        type='secondary'
        shape='circle'
        className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
        icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
        data-testid='file-upload-btn'
        aria-label={t('guid.context.addContext')}
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
                  icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                  data-testid='file-upload-btn'
                  aria-label={t('guid.context.addContext')}
                  onClick={() => setIsMobileSheetOpen(true)}
                />
                {files.length > 0 && (
                  <Tooltip
                    className={'!max-w-max'}
                    content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}
                  >
                    <span className='text-t-primary'>
                      {t('conversation.commandQueue.files', { count: files.length })}
                    </span>
                  </Tooltip>
                )}
              </span>
            ) : (
              <Dropdown trigger='click' onVisibleChange={setIsPlusDropdownOpen} droplist={menuContent}>
                {contextEntry}
              </Dropdown>
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

          {workspaceDir ? (
            <Tooltip content={workspaceDir} position='top'>
              <span className={styles.workspaceChip} data-testid='guid-workspace-chip'>
                <FolderOpen theme='outline' size='14' className='shrink-0' />
                <span className={styles.workspaceChipLabel}>{workspaceName}</span>
                <Button
                  type='text'
                  shape='circle'
                  size='mini'
                  className={styles.workspaceChipClear}
                  icon={<CloseSmall theme='outline' size='12' strokeWidth={3} />}
                  disabled={workspaceAccessDisabled}
                  onClick={onClearWorkspace}
                  data-testid='guid-workspace-clear'
                  aria-label={t('guid.context.clearWorkingDirectoryNamed', { name: workspaceName })}
                />
              </span>
            </Tooltip>
          ) : null}

          {fileAccessDisabled ? (
            <span className='sr-only' data-testid='opl-guid-file-access-disabled'>
              {fileAccessDisabledReason}
            </span>
          ) : null}
          {workspaceAccessDisabled ? (
            <span className='sr-only' data-testid='opl-guid-workspace-access-disabled'>
              {workspaceAccessDisabledReason}
            </span>
          ) : null}
        </div>
        {isMobile && (
          <>
            <MobileActionSheet
              open={isMobileSheetOpen}
              onClose={() => setIsMobileSheetOpen(false)}
              title={t('guid.context.addContext')}
              entries={mobileSheetEntries}
            />
            {mobileAttachHiddenInput}
          </>
        )}
        <div className={styles.actionSubmit} data-testid='guid-action-submit'>
          {!isMobile && configOptionCount > 0 && (
            <div className={styles.actionConfigGroup} data-mobile={isMobile ? 'true' : undefined}>
              {modelSelectorNode}

              {showModeSwitch && (
                <AgentModeSelector
                  backend={modeBackend}
                  compact
                  initialMode={selectedMode}
                  onModeSelect={onModeSelect}
                  compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
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
            icon={<ArrowUp theme='filled' size='14' fill='currentColor' strokeWidth={5} />}
            onClick={onSend}
            data-testid='guid-send-btn'
            aria-label={t('common.send', { defaultValue: 'Send' })}
          />
        </div>
      </div>
      <GuidWorkspaceManagementModal
        visible={isWorkspaceManagementOpen}
        onClose={() => setIsWorkspaceManagementOpen(false)}
      />
    </>
  );
};

export default GuidActionRow;
