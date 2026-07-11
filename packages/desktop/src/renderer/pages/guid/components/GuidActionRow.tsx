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
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import { supportsModeSwitch, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
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
import { Button, Checkbox, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Brain, Lightning, MagicHat, Plus, Shield, UploadOne } from '@icon-park/react';
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

  const openHostFilePicker = useCallback(() => {
    if (fileAccessDisabled) return;
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then((uploadedFiles) => {
        if (uploadedFiles && uploadedFiles.length > 0) {
          onFilesUploaded(uploadedFiles);
        }
      })
      .catch((error) => {
        console.error('Failed to open file dialog:', error);
      });
  }, [fileAccessDisabled, onFilesUploaded]);

  const handleMobileFilesAdded = useCallback(
    (items: Array<{ path: string }>) => {
      onFilesUploaded(items.map((item) => item.path));
    },
    [onFilesUploaded]
  );
  const { entries: mobileAttachEntries, hiddenFileInput: mobileAttachHiddenInput } = useAttachEntry({
    openFileSelector: openHostFilePicker,
    onLocalFilesAdded: handleMobileFilesAdded,
  });

  const isSkillChecked = (skill: GuidSkillMenuItem) => isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills);

  const activeSkillCount = allSkills.filter(isSkillChecked).length;
  const activeMcpCount = selectedMcpServerIds.length;

  const mobileSheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const entries: MobileActionSheetEntry[] = mobileAttachEntries.map((entry) => ({
      ...entry,
      disabled: fileAccessDisabled,
      description: fileAccessDisabled ? fileAccessDisabledReason : entry.description,
      dividerBefore: false,
    }));
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
          icon: <Brain theme='outline' size='16' />,
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
          icon: <Brain theme='outline' size='16' />,
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
    availableAgentModes,
    fileAccessDisabled,
    fileAccessDisabledReason,
    getModeDisplayLabel,
    isMobile,
    localeKey,
    mobileAttachEntries,
    mobileCodexModelSelection,
    modeBackend,
    onModeSelect,
    selectedMode,
    showMobileModeSwitch,
    t,
  ]);

  const menuContent = (
    <Menu
      className='min-w-200px'
      onClickMenuItem={(key) => {
        if (key === 'file') {
          openHostFilePicker();
        } else if (key === 'device') {
          fileInputRef.current?.click();
        }
      }}
    >
      {isWebUI ? (
        <>
          <Menu.Item key='file'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.addFiles')}</span>
            </div>
          </Menu.Item>
          <Menu.Item key='device'>
            <div className='flex items-center gap-8px'>
              <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
              <span>{t('common.fileAttach.myDevice')}</span>
            </div>
          </Menu.Item>
        </>
      ) : (
        <Menu.Item key='file'>
          <div className='flex items-center gap-8px'>
            <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
            <span>{t('common.fileAttach.addFiles')}</span>
          </div>
        </Menu.Item>
      )}
      {allSkills.length > 0 && (
        <Menu.SubMenu
          key='skills'
          title={
            <div className='flex items-center gap-8px'>
              <Lightning theme='filled' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('settings.capabilitiesTab.skills')} ({activeSkillCount}/{allSkills.length})
              </span>
            </div>
          }
          triggerProps={{
            popupStyle: {
              maxHeight: 360,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          {allSkills.map((skill) => (
            <Menu.Item
              key={`skill-${skill.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (skill.locked) return;
                onToggleSkill(skill.name, skill.isAuto);
              }}
            >
              <Checkbox
                checked={isGuidSkillChecked(skill, enabledSkills, disabledBuiltinSkills)}
                disabled={skill.locked}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => {
                  if (!skill.locked) onToggleSkill(skill.name, skill.isAuto);
                }}
              >
                <span className='text-13px'>{skill.name}</span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
      {mcpServers.length > 0 && (
        <Menu.SubMenu
          key='mcp'
          title={
            <div className='flex items-center gap-8px'>
              <Shield theme='outline' size='16' fill={iconColors.primary} style={{ lineHeight: 0 }} />
              <span>
                {t('mcp.label')} ({activeMcpCount}/{mcpServers.length})
              </span>
            </div>
          }
          triggerProps={{
            popupStyle: {
              maxHeight: 360,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }}
        >
          {mcpServers.map((server) => (
            <Menu.Item
              key={`mcp-${server.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMcpServer(server.id);
              }}
            >
              <Checkbox
                checked={selectedMcpServerIds.includes(server.id)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                onChange={() => onToggleMcpServer(server.id)}
              >
                <span className='text-13px'>
                  {server.name}
                  {server.tools?.length ? ` (${server.tools.length} ${t('mcp.tools')})` : ''}
                </span>
              </Checkbox>
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}
    </Menu>
  );

  const fileEntry = (
    <span
      className={`flex items-center gap-4px lh-[1] ${fileAccessDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      data-testid={fileAccessDisabled ? 'opl-guid-file-access-disabled' : undefined}
    >
      <Button
        type='secondary'
        shape='circle'
        className={isPlusDropdownOpen ? styles.plusButtonRotate : ''}
        icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
        loading={uploading}
        disabled={uploading || fileAccessDisabled}
        data-testid='file-upload-btn'
        aria-label={
          fileAccessDisabled ? fileAccessDisabledReason : t('common.fileAttach.addFiles', { defaultValue: 'Add files' })
        }
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
    <div className={styles.actionRow} data-testid='guid-action-row'>
      <div className={styles.actionTools}>
        <div className={styles.actionEntry}>
          {isMobile ? (
            <span className='flex items-center gap-4px lh-[1]'>
              <Button
                type='secondary'
                shape='circle'
                icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
                loading={uploading}
                disabled={uploading}
                data-testid='file-upload-btn'
                aria-label={t('common.more', { defaultValue: 'More' })}
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
          ) : fileAccessDisabled ? (
            <Tooltip content={fileAccessDisabledReason}>{fileEntry}</Tooltip>
          ) : (
            <Dropdown trigger='hover' onVisibleChange={setIsPlusDropdownOpen} droplist={menuContent}>
              {fileEntry}
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
      </div>
      {isMobile && (
        <>
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('common.more', { defaultValue: 'More' })}
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
  );
};

export default GuidActionRow;
