/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import coworkSvg from '@/renderer/assets/icons/cowork.svg';
import { useAssistantEditor, useAssistantList } from '@/renderer/hooks/assistant';
import { useManagedAgentBackends } from '@/renderer/hooks/agent/useManagedAgents';
import AssistantEditDrawer from '@/renderer/pages/settings/AssistantSettings/AssistantEditDrawer';
import DeleteAssistantModal from '@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal';
import SkillConfirmModals from '@/renderer/pages/settings/AssistantSettings/SkillConfirmModals';
import { resolveAvatarImageSrc } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import styles from '../index.module.css';
import type { AvailableAgent, EffectiveAgentInfo } from '../types';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterOplFoundryAssistants } from '../oplGuidProfile';

type AssistantSelectionAreaProps = {
  is_presetAgent: boolean;
  selectedAgentKey?: string;
  selectedAgentInfo: AvailableAgent | undefined;
  /**
   * Backend-merged preset catalog. Renders as the pill bar and drives the
   * selected-preset prompt examples. Does NOT include ACP engine configs —
   * those are a separate concept sourced from the AgentRegistry.
   */
  assistants: Assistant[];
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

export function resolveAssistantCardColumnCount(width: number): number {
  if (width >= 720) return 4;
  if (width >= 600) return 3;
  if (width >= 460) return 2;
  return 1;
}

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  is_presetAgent,
  selectedAgentKey,
  selectedAgentInfo,
  assistants,
  localeKey,
  currentEffectiveAgentInfo,
  onSelectAssistant,
  onSetInput,
  onFocusInput,
  onRegisterOpenDetails,
}) => {
  const { t } = useTranslation();
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });

  const avatarImageMap: Record<string, string> = useMemo(
    () => ({
      'cowork.svg': coworkSvg,
      '\u{1F6E0}\u{FE0F}': coworkSvg,
    }),
    []
  );

  // Internal useAssistantList owns the drawer editor's working state. Its
  // `assistants` list is the same backend catalog we receive via the
  // `assistants` prop (both sourced from ipcBridge.assistants.list), so we
  // drop it here to avoid a parallel fetch and prop shadow; lookups for the
  // editor target use the prop.
  const { activeAssistantId, setActiveAssistantId, activeAssistant, isExtensionAssistant, loadAssistants } =
    useAssistantList();
  const { availableBackends, refreshAgentDetection } = useManagedAgentBackends();

  const editor = useAssistantEditor({
    localeKey,
    activeAssistant,
    isExtensionAssistant,
    setActiveAssistantId,
    loadAssistants,
    refreshAgentDetection,
    availableBackends,
    message: agentMessage,
  });

  const editAvatarImage = resolveAvatarImageSrc(editor.editAvatar, avatarImageMap);

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
        builtinAutoSkills={editor.builtinAutoSkills}
        disabledBuiltinSkills={editor.disabledBuiltinSkills}
        setDisabledBuiltinSkills={editor.setDisabledBuiltinSkills}
        activeAssistant={activeAssistant}
        activeAssistantId={activeAssistantId}
        isExtensionAssistant={isExtensionAssistant}
        availableBackends={availableBackends}
        handleSave={editor.handleSave}
        handleDeleteClick={editor.handleDeleteClick}
        handleDuplicate={(assistant) => void editor.handleDuplicate(assistant)}
      />
      <DeleteAssistantModal
        visible={editor.deleteConfirmVisible}
        onCancel={() => editor.setDeleteConfirmVisible(false)}
        onConfirm={editor.handleDeleteConfirm}
        activeAssistant={activeAssistant}
        avatarImageMap={avatarImageMap}
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
    </>
  );

  const resolveOpenAssistantId = (): string | null => {
    if (selectedAgentInfo?.custom_agent_id) return selectedAgentInfo.custom_agent_id;
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
    // `assistants` is the backend-merged catalog (builtin + user + extension)
    // and is the only list that yields the Assistant shape the editor expects.
    const targetAssistant = assistants.find((assistant) => candidates.includes(assistant.id));
    if (!targetAssistant) {
      agentMessage.warning(
        t('common.failed', { defaultValue: 'Failed' }) +
          `: ${t('settings.editAssistant', { defaultValue: 'Assistant Details' })}`
      );
      return;
    }

    void editor.handleEdit(targetAssistant);
  }, [agentMessage, assistants, editor, selectedAgentInfo?.custom_agent_id, selectedAgentKey, t]);

  useLayoutEffect(() => {
    if (!onRegisterOpenDetails) return;
    onRegisterOpenDetails(openAssistantDetails);
  }, [onRegisterOpenDetails, openAssistantDetails]);

  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [assistantColumnCount, setAssistantColumnCount] = useState(() =>
    resolveAssistantCardColumnCount(typeof window === 'undefined' ? 720 : window.innerWidth)
  );

  useEffect(() => {
    const el = scrollWrapRef.current;
    if (!el) return;
    const measure = () => {
      setIsScrollable(el.scrollHeight > el.clientHeight + 1);
      setAssistantColumnCount(resolveAssistantCardColumnCount(el.clientWidth || window.innerWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [assistants]);

  const foundryAssistants = useMemo(() => filterOplFoundryAssistants(assistants), [assistants]);

  if ((!assistants || assistants.length === 0) && foundryAssistants.length === 0) return null;
  const selectedAssistantId = selectedAgentInfo?.custom_agent_id?.replace(/^builtin-/, '');
  const selectedAssistant = selectedAssistantId
    ? assistants.find((assistant) => resolveAssistantCandidateIds(selectedAssistantId).includes(assistant.id))
    : undefined;
  const selectedAssistantPrompts =
    selectedAssistant?.prompts_i18n?.[localeKey] ||
    selectedAssistant?.prompts_i18n?.['en-US'] ||
    selectedAssistant?.prompts ||
    [];

  // Assistant List View
  return (
    <div className='mt-24px w-full'>
      {currentEffectiveAgentInfo.isFallback ? (
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
                currentEffectiveAgentInfo.agent_type.charAt(0).toUpperCase() +
                currentEffectiveAgentInfo.agent_type.slice(1),
              defaultValue: `${currentEffectiveAgentInfo.originalType.charAt(0).toUpperCase() + currentEffectiveAgentInfo.originalType.slice(1)} is unavailable, using ${currentEffectiveAgentInfo.agent_type.charAt(0).toUpperCase() + currentEffectiveAgentInfo.agent_type.slice(1)} instead.`,
            })}
          </span>
        </div>
      ) : null}
      {!is_presetAgent ? (
        <div className={`${styles.assistantPromptHint} text-center mb-12px`}>
          {t('guid.selectAssistantHint', { defaultValue: 'Select an assistant to start a task' })}
        </div>
      ) : null}
      <div
        ref={scrollWrapRef}
        className={`${styles.assistantCardScrollWrap} ${isScrollable ? styles.assistantCardScrollWrapScrollable : ''}`}
      >
        <div
          className={styles.assistantCardGrid}
          style={{ gridTemplateColumns: `repeat(${assistantColumnCount}, minmax(0, 1fr))` }}
        >
          {foundryAssistants.map((assistant) => {
            const description =
              assistant.description_i18n?.[localeKey] ||
              assistant.description_i18n?.['en-US'] ||
              assistant.description ||
              '';
            const label = assistant.name_i18n?.[localeKey] || assistant.name;
            return (
              <div
                key={assistant.id}
                data-testid={`preset-pill-${assistant.id}`}
                className={`${styles.assistantCard} ${selectedAssistantId === assistant.id ? styles.assistantCardSelected : ''}`}
                onClick={() => {
                  onSelectAssistant(`custom:${assistant.id}`);
                  onFocusInput();
                }}
              >
                <div className={styles.assistantCardMeta}>
                  <div className={styles.assistantCardName}>@{label}</div>
                  {description && <div className={styles.assistantCardDesc}>{description}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedAssistantPrompts.length > 0 ? (
        <div className='mt-16px'>
          <div className={styles.assistantPromptHint}>
            {t('guid.promptExamplesHint', { defaultValue: 'Try these example prompts:' })}
          </div>
          <div className='flex flex-wrap gap-8px mt-12px'>
            {selectedAssistantPrompts.map((prompt: string, index: number) => (
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
      ) : null}
      {modalTree}
    </div>
  );
};

export default AssistantSelectionArea;
