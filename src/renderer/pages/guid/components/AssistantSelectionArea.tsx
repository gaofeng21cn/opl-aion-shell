/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import masLogo from '@/renderer/assets/logos/opl-modules/mas.svg';
import magLogo from '@/renderer/assets/logos/opl-modules/mag.svg';
import rcaLogo from '@/renderer/assets/logos/opl-modules/rca.svg';
import {
  useDetectedAgents,
  useAssistantEditor,
  useAssistantList,
  useAssistantSkills,
} from '@/renderer/hooks/assistant';
import AddCustomPathModal from '@/renderer/pages/settings/AssistantSettings/AddCustomPathModal';
import AddSkillsModal from '@/renderer/pages/settings/AssistantSettings/AddSkillsModal';
import AssistantEditDrawer from '@/renderer/pages/settings/AssistantSettings/AssistantEditDrawer';
import DeleteAssistantModal from '@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal';
import SkillConfirmModals from '@/renderer/pages/settings/AssistantSettings/SkillConfirmModals';
import { resolveAvatarImageSrc } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import styles from '../index.module.css';
import type { AcpBackendConfig, AvailableAgent, EffectiveAgentInfo } from '../types';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type AssistantSelectionAreaProps = {
  isPresetAgent: boolean;
  selectedAgentKey?: string;
  selectedAgentInfo: AvailableAgent | undefined;
  customAgents: AcpBackendConfig[];
  localeKey: string;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  onSelectAssistant: (assistantId: string) => void;
  onSetInput: (text: string) => void;
  onFocusInput: () => void;
  onRegisterOpenDetails?: (openDetails: (() => void) | null) => void;
};

const resolveAssistantCandidateIds = (assistantId: string): string[] => {
  const stripped = assistantId.replace(/^builtin-/, '');
  return Array.from(new Set([assistantId, `builtin-${stripped}`, stripped]));
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  isPresetAgent,
  selectedAgentKey,
  selectedAgentInfo,
  customAgents,
  localeKey,
  currentEffectiveAgentInfo,
  onSelectAssistant,
  onSetInput,
  onFocusInput,
  onRegisterOpenDetails,
}) => {
  const { t } = useTranslation();
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });

  const avatarImageMap: Record<string, string> = useMemo(() => ({}), []);

  const { assistants, activeAssistantId, setActiveAssistantId, activeAssistant, isExtensionAssistant, loadAssistants } =
    useAssistantList();
  const { availableBackends, refreshAgentDetection } = useDetectedAgents();

  const editor = useAssistantEditor({
    localeKey,
    activeAssistant,
    isExtensionAssistant,
    setActiveAssistantId,
    loadAssistants,
    refreshAgentDetection,
    message: agentMessage,
  });

  const skills = useAssistantSkills({
    skillsModalVisible: editor.skillsModalVisible,
    customSkills: editor.customSkills,
    selectedSkills: editor.selectedSkills,
    pendingSkills: editor.pendingSkills,
    availableSkills: editor.availableSkills,
    setPendingSkills: editor.setPendingSkills,
    setCustomSkills: editor.setCustomSkills,
    setSelectedSkills: editor.setSelectedSkills,
    message: agentMessage,
  });

  const editAvatarImage = resolveAvatarImageSrc(editor.editAvatar, avatarImageMap);

  const oplModules = useMemo(
    () => [
      {
        id: 'mas',
        logo: masLogo,
        label: localeKey === 'zh-CN' ? 'MAS 医学研究' : 'MAS Research',
        prompt:
          localeKey === 'zh-CN'
            ? '@MAS 帮我推进一个医学研究任务：'
            : '@MAS Help me advance a medical research task: ',
      },
      {
        id: 'mag',
        logo: magLogo,
        label: localeKey === 'zh-CN' ? 'MAG 基金申请' : 'MAG Grants',
        prompt:
          localeKey === 'zh-CN'
            ? '@MAG 帮我推进一个基金申请任务：'
            : '@MAG Help me advance a grant task: ',
      },
      {
        id: 'rca',
        logo: rcaLogo,
        label: localeKey === 'zh-CN' ? 'RCA 汇报材料' : 'RCA Presentations',
        prompt:
          localeKey === 'zh-CN'
            ? '@RCA 帮我推进一个汇报或幻灯片任务：'
            : '@RCA Help me prepare a presentation task: ',
      },
    ],
    [localeKey]
  );

  const modalTree = (
    <>
      {agentMessageContext}
      <AssistantEditDrawer
        editVisible={editor.editVisible}
        setEditVisible={editor.setEditVisible}
        isCreating={editor.isCreating}
        editName={editor.editName}
        setEditName={editor.setEditName}
        editDescription={editor.editDescription}
        setEditDescription={editor.setEditDescription}
        editAvatar={editor.editAvatar}
        setEditAvatar={editor.setEditAvatar}
        editAvatarImage={editAvatarImage}
        editAgent={editor.editAgent}
        setEditAgent={editor.setEditAgent}
        editContext={editor.editContext}
        setEditContext={editor.setEditContext}
        promptViewMode={editor.promptViewMode}
        setPromptViewMode={editor.setPromptViewMode}
        availableSkills={editor.availableSkills}
        selectedSkills={editor.selectedSkills}
        setSelectedSkills={editor.setSelectedSkills}
        pendingSkills={editor.pendingSkills}
        customSkills={editor.customSkills}
        setDeletePendingSkillName={editor.setDeletePendingSkillName}
        setDeleteCustomSkillName={editor.setDeleteCustomSkillName}
        setSkillsModalVisible={editor.setSkillsModalVisible}
        builtinAutoSkills={editor.builtinAutoSkills}
        disabledBuiltinSkills={editor.disabledBuiltinSkills}
        setDisabledBuiltinSkills={editor.setDisabledBuiltinSkills}
        activeAssistant={activeAssistant}
        activeAssistantId={activeAssistantId}
        isExtensionAssistant={isExtensionAssistant}
        availableBackends={availableBackends}
        handleSave={editor.handleSave}
        handleDeleteClick={editor.handleDeleteClick}
      />
      <DeleteAssistantModal
        visible={editor.deleteConfirmVisible}
        onCancel={() => editor.setDeleteConfirmVisible(false)}
        onConfirm={editor.handleDeleteConfirm}
        activeAssistant={activeAssistant}
        avatarImageMap={avatarImageMap}
      />
      <AddSkillsModal
        visible={editor.skillsModalVisible}
        onCancel={() => {
          editor.setSkillsModalVisible(false);
          skills.setSearchExternalQuery('');
        }}
        externalSources={skills.externalSources}
        activeSourceTab={skills.activeSourceTab}
        setActiveSourceTab={skills.setActiveSourceTab}
        activeSource={skills.activeSource}
        filteredExternalSkills={skills.filteredExternalSkills}
        externalSkillsLoading={skills.externalSkillsLoading}
        searchExternalQuery={skills.searchExternalQuery}
        setSearchExternalQuery={skills.setSearchExternalQuery}
        refreshing={skills.refreshing}
        handleRefreshExternal={skills.handleRefreshExternal}
        setShowAddPathModal={skills.setShowAddPathModal}
        customSkills={editor.customSkills}
        handleAddFoundSkills={skills.handleAddFoundSkills}
      />
      <SkillConfirmModals
        deletePendingSkillName={editor.deletePendingSkillName}
        setDeletePendingSkillName={editor.setDeletePendingSkillName}
        pendingSkills={editor.pendingSkills}
        setPendingSkills={editor.setPendingSkills}
        deleteCustomSkillName={editor.deleteCustomSkillName}
        setDeleteCustomSkillName={editor.setDeleteCustomSkillName}
        customSkills={editor.customSkills}
        setCustomSkills={editor.setCustomSkills}
        selectedSkills={editor.selectedSkills}
        setSelectedSkills={editor.setSelectedSkills}
        message={agentMessage}
      />
      <AddCustomPathModal
        visible={skills.showAddPathModal}
        onCancel={() => {
          skills.setShowAddPathModal(false);
          skills.setCustomPathName('');
          skills.setCustomPathValue('');
        }}
        onOk={() => void skills.handleAddCustomPath()}
        customPathName={skills.customPathName}
        setCustomPathName={skills.setCustomPathName}
        customPathValue={skills.customPathValue}
        setCustomPathValue={skills.setCustomPathValue}
      />
    </>
  );

  const resolveOpenAssistantId = (): string | null => {
    if (selectedAgentInfo?.customAgentId) return selectedAgentInfo.customAgentId;
    if (selectedAgentKey?.startsWith('custom:')) return selectedAgentKey.slice(7);
    return null;
  };

  const openAssistantDetails = useCallback(() => {
    const assistantId = resolveOpenAssistantId();
    if (!assistantId) {
      agentMessage.warning(
        t('common.failed', { defaultValue: 'Failed' }) +
          `: ${t('settings.editAssistant', { defaultValue: 'Assistant Details' })}`
      );
      return;
    }

    const candidates = resolveAssistantCandidateIds(assistantId);
    const targetAssistant = [...assistants, ...customAgents].find((assistant) => candidates.includes(assistant.id));
    if (!targetAssistant) {
      agentMessage.warning(
        t('common.failed', { defaultValue: 'Failed' }) +
          `: ${t('settings.editAssistant', { defaultValue: 'Assistant Details' })}`
      );
      return;
    }

    void editor.handleEdit(targetAssistant);
  }, [agentMessage, assistants, customAgents, editor, selectedAgentInfo?.customAgentId, selectedAgentKey, t]);

  useLayoutEffect(() => {
    if (!onRegisterOpenDetails) return;
    onRegisterOpenDetails(openAssistantDetails);
  }, [onRegisterOpenDetails, openAssistantDetails]);

  // Only render if there are preset agents
  if (!customAgents || !customAgents.some((a) => a.isPreset)) return null;

  if (isPresetAgent && selectedAgentInfo) {
    // Selected Assistant View
    return (
      <div className='mt-12px w-full'>
        <div className='flex flex-col w-full animate-fade-in'>
          {/* Main Agent Fallback Notice */}
          {currentEffectiveAgentInfo.isFallback && (
            <div
              className='mb-12px px-12px py-8px rd-8px text-12px flex items-center gap-8px'
              style={{
                background: 'rgb(var(--warning-1))',
                border: '1px solid rgb(var(--warning-3))',
                color: 'rgb(var(--warning-6))',
              }}
            >
              <span>
                {t('guid.agentFallbackNotice', {
                  original:
                    currentEffectiveAgentInfo.originalType.charAt(0).toUpperCase() +
                    currentEffectiveAgentInfo.originalType.slice(1),
                  fallback:
                    currentEffectiveAgentInfo.agentType.charAt(0).toUpperCase() +
                    currentEffectiveAgentInfo.agentType.slice(1),
                  defaultValue: `${currentEffectiveAgentInfo.originalType.charAt(0).toUpperCase() + currentEffectiveAgentInfo.originalType.slice(1)} is unavailable, using ${currentEffectiveAgentInfo.agentType.charAt(0).toUpperCase() + currentEffectiveAgentInfo.agentType.slice(1)} instead.`,
                })}
              </span>
            </div>
          )}
          {/* Prompts Section */}
          {(() => {
            const agent = customAgents.find((a) => a.id === selectedAgentInfo.customAgentId);
            const prompts = agent?.promptsI18n?.[localeKey] || agent?.promptsI18n?.['en-US'] || agent?.prompts;
            if (prompts && prompts.length > 0) {
              return (
                <div className='mt-16px'>
                  <div className={styles.assistantPromptHint}>
                    {t('guid.promptExamplesHint', { defaultValue: 'Try these example prompts:' })}
                  </div>
                  <div className='flex flex-wrap gap-8px mt-12px'>
                    {prompts.map((prompt: string, index: number) => (
                      <div
                        key={index}
                        className={`${styles.assistantPromptChip} px-12px py-6px text-2 text-13px rd-16px cursor-pointer transition-colors shadow-sm`}
                        onClick={() => {
                          onSetInput(prompt);
                          onFocusInput();
                        }}
                      >
                        {prompt}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
        {modalTree}
      </div>
    );
  }

  // Assistant List View
  return (
    <div className='mt-12px w-full'>
      <div className='flex flex-wrap gap-8px justify-center'>
        {oplModules.map((module) => (
          <div
            key={module.id}
            data-testid={`opl-module-pill-${module.id}`}
            className='h-28px group flex items-center gap-8px px-16px rd-100px cursor-pointer transition-all b-1 b-solid bg-fill-0 hover:bg-fill-1 select-none'
            style={{
              borderWidth: '1px',
              borderColor: 'color-mix(in srgb, var(--color-border-2) 70%, transparent)',
            }}
            onClick={() => {
              onSetInput(module.prompt);
              onFocusInput();
            }}
          >
            <img src={module.logo} alt='' width={16} height={16} style={{ objectFit: 'contain' }} />
            <span className='text-14px text-2 hover:text-1'>{module.label}</span>
          </div>
        ))}
      </div>
      {modalTree}
    </div>
  );
};

export default AssistantSelectionArea;
