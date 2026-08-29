/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { type ChatFileRef, isChatFileRef, uploadFileRef } from '@/common/types/chatFile';
import { filterOplOrdinaryMcpStatuses, filterOplOrdinarySkillNames } from '@/common/config/oplProductProfile';
import type { IConversationMcpStatus } from '@/common/config/storage';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import ConversationComposerContextStrip from '@/renderer/components/chat/composer/ConversationComposerContextStrip';
import type { ComposerCapabilityPaletteItem } from '@/renderer/components/chat/composer/ComposerCapabilityPalette';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
  useAttachEntry,
} from '@/renderer/components/chat/MobileActionSheet';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import {
  getSendBoxDraftHook,
  mergeFailedSendDraft,
  type FileOrFolderItem,
} from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { savePreferredMode } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { localSelectionItems, mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { collectChatFileRefs, splitChatFileRefs } from '@/renderer/utils/file/messageFiles';
import {
  filterNonPermissionAccessModes,
  getAgentModes,
  mergeWithCapabilities,
  type AgentModeOption,
} from '@/renderer/utils/model/agentModes';
import { Message, Tag } from '@arco-design/web-react';
import { Compass, Lightning, Link, MagicHat, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AionrsModelSelector from './AionrsModelSelector';
import { useAionrsMessage } from './useAionrsMessage';
import type { AionrsModelSelection } from './useAionrsModelSelection';

const useAionrsSendBoxDraft = getSendBoxDraftHook('aionrs', {
  _type: 'aionrs',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAionrsSendBoxDraft(conversation_id);

  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: React.SetStateAction<string>) => {
      mutate((prev) => ({
        ...prev,
        content: typeof nextContent === 'function' ? nextContent(prev.content) : nextContent,
      }));
    },
    [data, mutate]
  );

  const restoreFailedSend = useCallback(
    (failedContent: string, failedFiles: ChatFileRef[]) => {
      mutate((prev) => mergeFailedSendDraft(prev, failedContent, failedFiles));
    },
    [mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
    restoreFailedSend,
  };
};

const AionrsSendBox: React.FC<{
  conversation_id: string;
  modelSelection: AionrsModelSelection;
  session_mode?: string;
  agent_name?: string;
  workspacePath?: string;
  branch?: string;
  activeCapabilityLabel?: string;
}> = ({
  conversation_id,
  modelSelection,
  session_mode,
  agent_name,
  workspacePath: workspaceProp,
  branch,
  activeCapabilityLabel,
}) => {
  const [workspacePath, setWorkspacePath] = useState(workspaceProp ?? '');
  const [dynamicModes, setDynamicModes] = useState<AgentModeOption[]>([]);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const conversationContext = useConversationContextSafe();
  const loadedSkills = filterOplOrdinarySkillNames(conversationContext?.loadedSkills ?? []);
  const loadedMcpStatuses = filterOplOrdinaryMcpStatuses(
    conversationContext?.loadedMcpStatuses ??
      (conversationContext?.loadedMcpServers ?? []).map<IConversationMcpStatus>((name) => ({
        id: name,
        name,
        status: 'loaded',
      }))
  );
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { checkAndUpdateTitle } = useAutoTitle();
  const { current_model } = modelSelection;
  const teamPermission = useTeamPermission();
  const propagateMode = teamPermission?.propagateMode;
  const sessionModes = useMemo(() => filterNonPermissionAccessModes(dynamicModes), [dynamicModes]);

  const { thought, running, setActiveMsgId, setWaitingResponse, resetState } = useAionrsMessage(conversation_id, {
    onConfigChanged: (capabilities) => {
      const modes = (capabilities as { modes?: string[] })?.modes;
      if (modes && modes.length > 0) {
        setDynamicModes(mergeWithCapabilities('aionrs', modes));
      }
    },
  });
  const runtimeView = useConversationRuntimeView(conversation_id);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent, restoreFailedSend } =
    useSendBoxDraft(conversation_id);

  const handleContentChange = useCallback(
    (val: string) => {
      if (val && teamPermission) teamPermission.warmupSession();
      setContent(val);
    },
    [teamPermission, setContent]
  );

  const [agentWarmed, setAgentWarmed] = useState(false);
  const prepareRuntimeSync = useCallback(async () => {
    if (teamPermission) {
      await teamPermission.warmupSession();
    }
    await warmupConversation(conversation_id);
  }, [conversation_id, teamPermission]);

  useEffect(() => {
    void getConversationOrNull(conversation_id).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  useEffect(() => {
    if (!conversation_id) return;
    setAgentWarmed(false);
    void prepareRuntimeSync()
      .then(() => {
        setAgentWarmed(true);
      })
      .catch((error) => {
        Message.error(getConversationRuntimeWorkspaceErrorMessage(error, t));
      });
  }, [conversation_id, prepareRuntimeSync, t]);

  const slash_commands = useSlashCommands(conversation_id, {
    conversation_type: 'aionrs',
    agentStatus: agentWarmed ? 'active' : null,
  });

  const { setSendBoxHandler } = usePreviewContext();
  const isBusy = runtimeView.isProcessing || !runtimeView.canSendMessage;

  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      const new_content = content ? `${content}\n${text}` : text;
      setContentRef.current(new_content);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to append text to sendbox
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      const prev = contentRef.current;
      setContentRef.current(prev ? `${prev}${text}` : text);
    },
    []
  );

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (teamPermission) await teamPermission.warmupSession();
      if (!current_model?.use_model) {
        Message.warning(t('conversation.chat.noModelSelected'));
        throw new Error('No model selected');
      }

      runtimeView.markSendStarted();
      setWaitingResponse(true);

      try {
        void checkAndUpdateTitle(conversation_id, input);
        const res = await ipcBridge.conversation.sendMessage.invoke({
          input,
          conversation_id,
          files,
        });
        setActiveMsgId(res.msg_id);
        runtimeView.markSendAccepted(res.turn_id, res.runtime, res.msg_id);
        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('aionrs.workspace.refresh');
        }
      } catch (error) {
        const errorMessage =
          getConversationRuntimeWorkspaceErrorMessage(error, t) ||
          (error instanceof Error ? error.message : String(error));
        runtimeView.markSendFailed(errorMessage);
        Message.error(errorMessage);
        throw error;
      }
    },
    [checkAndUpdateTitle, conversation_id, current_model?.use_model, runtimeView, setActiveMsgId, setWaitingResponse, t]
  );

  const {
    items: queuedCommands,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    enabled: true,
    isBusy,
    runtimeGate: {
      hydrated: runtimeView.hydrated,
      canSendMessage: runtimeView.canSendMessage,
      isProcessing: runtimeView.isProcessing,
    },
    onExecute: executeCommand,
  });

  // Handle initial message from Guid page — wait until model is ready
  useEffect(() => {
    if (!conversation_id || !current_model?.use_model) return;

    const storageKey = `aionrs_initial_message_${conversation_id}`;
    const processedKey = `aionrs_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      if (sessionStorage.getItem(processedKey)) return;
      const storedMessage = sessionStorage.getItem(storageKey);
      if (!storedMessage) return;

      sessionStorage.setItem(processedKey, '1');
      sessionStorage.removeItem(storageKey);

      let input = '';
      let initialFiles: ChatFileRef[] = [];
      try {
        const initialMessage = JSON.parse(storedMessage);
        input = typeof initialMessage.input === 'string' ? initialMessage.input : '';
        initialFiles = Array.isArray(initialMessage.files)
          ? initialMessage.files
              .map((file: unknown) => (typeof file === 'string' ? uploadFileRef(file) : file))
              .filter(isChatFileRef)
          : [];
        await executeCommand({ input, files: initialFiles });
      } catch (error) {
        console.error('[AionrsSendBox] Failed to send initial message:', error);
        restoreFailedSend(input, initialFiles);
        sessionStorage.removeItem(processedKey);
      }
    };

    void processInitialMessage();
  }, [conversation_id, current_model?.use_model, executeCommand, restoreFailedSend]);

  const onSendHandler = async (message: string) => {
    const filesToSend = collectChatFileRefs(uploadFile, atPath);
    clearFiles();
    emitter.emit('aionrs.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy,
        hasPendingCommands,
      })
    ) {
      const queued = enqueue({ input: message, files: filesToSend });
      if (!queued) restoreFailedSend(message, filesToSend);
      return;
    }

    try {
      await executeCommand({ input: message, files: filesToSend });
    } catch (error) {
      restoreFailedSend(message, filesToSend);
      throw error;
    }
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      const restored = splitChatFileRefs(item.files);
      setUploadFile(restored.uploadFiles);
      setAtPath(restored.atPath);
      emitter.emit('aionrs.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      const merged = mergeFileSelectionItems(atPathRef.current, localSelectionItems(files));
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    },
    [setAtPath]
  );
  const { openFileSelector, openDirectorySelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const { entries: attachEntries, hiddenFileInput: attachHiddenInput } = useAttachEntry({
    openFileSelector,
    openDirectorySelector,
    directoryLabel: t('guid.context.attachDirectory'),
    onLocalFilesAdded: handleFilesAdded,
  });

  // Session-mode selection mirrors AgentModeSelector's runtime update path.
  const handlePaletteModeChange = useCallback(
    async (mode: string) => {
      if (mode === currentMode) return;
      try {
        await prepareRuntimeSync();
        const confirmed = await ipcBridge.acpConversation.setMode.invoke({ conversation_id, mode });
        const confirmedMode = confirmed.mode || mode;
        setCurrentMode(confirmedMode);
        void savePreferredMode('aionrs', confirmedMode);
        propagateMode?.(confirmedMode);
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AionrsSendBox] Failed to switch session mode via palette:', error);
        Message.error(t('agentMode.switchFailed'));
      }
    },
    [conversation_id, currentMode, prepareRuntimeSync, propagateMode, t]
  );

  const isModeSurfaceOpen = isMobile ? isMobileSheetOpen : isPaletteOpen;
  // Sync currentMode from the backend whenever a compact mode surface opens.
  useEffect(() => {
    if (!isModeSurfaceOpen) return;
    if (!conversation_id) return;
    let cancelled = false;
    void prepareRuntimeSync()
      .then(() => ipcBridge.acpConversation.getMode.invoke({ conversation_id }))
      .then((result) => {
        if (cancelled || !result) return;
        if (result.initialized !== false) {
          setCurrentMode(result.mode);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation_id, isModeSurfaceOpen, prepareRuntimeSync]);

  const sessionModeItems = useMemo<ComposerCapabilityPaletteItem[]>(
    () =>
      sessionModes.map((mode) => ({
        id: `mode-${mode.value}`,
        label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
        description: mode.description,
        icon: <Compass theme='outline' size='16' />,
        active: currentMode === mode.value,
        closeOnSelect: false,
        onSelect: () => void handlePaletteModeChange(mode.value),
      })),
    [currentMode, handlePaletteModeChange, sessionModes, t]
  );

  const handleSheetModelSelect = useCallback(
    (value: string) => {
      const separatorIndex = value.indexOf('::');
      if (separatorIndex < 0) return;
      const providerId = value.slice(0, separatorIndex);
      const modelName = value.slice(separatorIndex + 2);
      const provider = modelSelection.providers.find((candidate) => candidate.id === providerId);
      if (!provider || !modelName) return;
      void modelSelection.handleSelectModel(provider, modelName);
    },
    [modelSelection]
  );

  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const entries: MobileActionSheetEntry[] = attachEntries.map((entry) => ({
      ...entry,
      dividerBefore: false,
    }));

    if (loadedSkills.length > 0) {
      entries.push({
        key: 'skills',
        icon: <Lightning theme='outline' size='16' />,
        label: t('guid.context.skillsGroup'),
        meta: loadedSkills.length,
        submenu: {
          title: t('guid.context.skillsGroup'),
          selectable: false,
          options: loadedSkills.map((name) => ({ key: name, label: name })),
          onSelect: (name) => emitter.emit('sendbox.fill', `/${name} `),
        },
      });
    } else {
      entries.push({
        key: 'manage-skills',
        icon: <Lightning theme='outline' size='16' />,
        label: t('conversation.skills.manage'),
        description: t('conversation.skills.empty'),
        onClick: () => void navigate('/settings/capabilities?tab=skills'),
      });
    }

    if (sessionModeItems.length > 0) {
      entries.push({
        key: 'session-modes',
        icon: <Compass theme='outline' size='16' />,
        label: t('guid.context.sessionModesGroup'),
        meta: sessionModeItems.find((item) => item.active)?.label,
        submenu: {
          title: t('guid.context.sessionModesGroup'),
          options: sessionModeItems.map((item) => ({
            key: item.id,
            label: item.label,
            description: item.description,
            active: item.active,
          })),
          onSelect: (itemId) => sessionModeItems.find((item) => item.id === itemId)?.onSelect(),
        },
      });
    }

    if (loadedMcpStatuses.length > 0) {
      entries.push({
        key: 'connections',
        icon: <Link theme='outline' size='16' />,
        label: t('guid.context.appsAndConnectionsGroup'),
        meta: loadedMcpStatuses.length,
        submenu: {
          title: t('guid.context.appsAndConnectionsGroup'),
          selectable: false,
          options: loadedMcpStatuses.map((status) => ({
            key: status.id,
            label: status.name,
            description: status.reason,
            disabled: true,
          })),
          onSelect: () => undefined,
        },
      });
    } else {
      entries.push({
        key: 'manage-connections',
        icon: <Link theme='outline' size='16' />,
        label: t('conversation.mcp.manage'),
        description: t('conversation.mcp.empty'),
        onClick: () => void navigate('/settings/capabilities?tab=tools'),
      });
    }

    const availableModes = dynamicModes.length > 0 ? dynamicModes : getAgentModes('aionrs');
    const sessionModeValues = new Set(sessionModes.map((mode) => mode.value));
    const permissionModes = availableModes.filter((mode) => !sessionModeValues.has(mode.value));
    if (permissionModes.length > 0) {
      const permissionOptions: MobileActionSheetOption[] = permissionModes.map((mode) => ({
        key: mode.value,
        label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
        description: mode.description,
        active: currentMode === mode.value,
      }));
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: permissionOptions.find((option) => option.active)?.label,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: permissionOptions,
          onSelect: (key) => void handlePaletteModeChange(key),
        },
      });
    }

    const modelOptions: MobileActionSheetOption[] = modelSelection.providers.flatMap((provider) =>
      modelSelection.getAvailableModels(provider).map((modelName) => ({
        key: `${provider.id}::${modelName}`,
        label: modelName,
        description: provider.name,
        active:
          modelSelection.current_model?.id === provider.id && modelSelection.current_model?.use_model === modelName,
      }))
    );
    entries.push({
      key: 'model',
      icon: <MagicHat theme='outline' size='16' />,
      label: t('common.model', { defaultValue: 'Model' }),
      meta: modelSelection.current_model?.use_model || t('conversation.welcome.selectModel'),
      submenu: {
        title: t('common.model', { defaultValue: 'Model' }),
        options: modelOptions,
        onSelect: handleSheetModelSelect,
        emptyText: t('conversation.welcome.selectModel'),
      },
    });

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
    attachEntries,
    currentMode,
    dynamicModes,
    handlePaletteModeChange,
    handleSheetModelSelect,
    isMobile,
    loadedMcpStatuses,
    loadedSkills,
    modelSelection,
    navigate,
    sessionModeItems,
    sessionModes,
    t,
  ]);

  const composerCapabilityPalette = (
    <FileAttachButton
      openFileSelector={openFileSelector}
      openDirectorySelector={openDirectorySelector}
      onLocalFilesAdded={handleFilesAdded}
      loadedSkills={loadedSkills}
      loadedMcpStatuses={loadedMcpStatuses}
      sessionModeItems={sessionModeItems}
      onPaletteOpenChange={setIsPaletteOpen}
    />
  );

  useAddEventListener('aionrs.selected.file', setAtPath);
  useAddEventListener('aionrs.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Best-effort cancel: swallow rejections so they don't bubble up as
    // unhandled rejections. UI state is still reset via finally.
    const turnId = runtimeView.activeTurnId;
    if (!turnId) {
      resetState();
      resetActiveExecution('stop');
      return;
    }
    runtimeView.markStopRequested(turnId);
    try {
      const result = await ipcBridge.conversation.stop.invoke({ conversation_id, turn_id: turnId });
      runtimeView.markStopAcknowledged(turnId, result.runtime);
    } catch (error) {
      console.warn('[AionrsSendBox] stop request failed', error);
      runtimeView.resetLocalGate('stop_failed');
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-736px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <CommandQueuePanel
        items={queuedCommands}
        paused={isQueuePaused}
        interactionLocked={isQueueInteractionLocked}
        onPause={pause}
        onResume={resume}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay thought={thought} running={running} onStop={handleStop} />
      <ConversationComposerContextStrip
        workspacePath={workspacePath}
        branch={branch}
        activeCapabilityLabel={activeCapabilityLabel}
      />

      <SendBox
        data-testid='aionrs-sendbox'
        onMobilePlusClick={isMobile ? () => setIsMobileSheetOpen(true) : undefined}
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('aionrs.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={!current_model?.use_model}
        placeholder={t('conversation.chat.oplPlaceholder')}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        defaultMultiLine={!isMobile}
        lockMultiLine={!isMobile}
        tools={composerCapabilityPalette}
        rightTools={
          !isMobile ? (
            <div className='sendbox-decision-controls' data-testid='aionrs-sendbox-decision-controls'>
              <div className='sendbox-decision-control'>
                <AionrsModelSelector selection={modelSelection} />
              </div>
              <div className='sendbox-decision-control'>
                <AgentModeSelector
                  backend='aionrs'
                  conversation_id={conversation_id}
                  compact
                  initialMode={session_mode}
                  dynamicModes={dynamicModes}
                  compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                  modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                  compactLabelPrefix={t('agentMode.permission')}
                  hideCompactLabelPrefixOnMobile
                  onModeChanged={propagateMode}
                  beforeRuntimeSync={prepareRuntimeSync}
                />
              </div>
            </div>
          ) : undefined
        }
        prefix={
          <>
            {uploadFile.length > 0 && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    data-testid={`aionrs-file-tag-${uploadFile.indexOf(path)}`}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
                ))}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    const folderIndex = atPath.filter((v) => typeof v !== 'string' && !v.isFile).indexOf(item);
                    return (
                      <Tag
                        key={item.path}
                        data-testid={`aionrs-folder-tag-${folderIndex}`}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('aionrs.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
        slash_commands={slash_commands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
      />
      {isMobile ? (
        <>
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('common.more', { defaultValue: 'More' })}
            entries={sheetEntries}
          />
          {attachHiddenInput}
        </>
      ) : null}
    </div>
  );
};

export default AionrsSendBox;
