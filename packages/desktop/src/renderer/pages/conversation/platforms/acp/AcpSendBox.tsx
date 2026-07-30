import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import {
  filterOplOrdinaryMcpStatuses,
  filterOplOrdinarySkillNames,
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  isOplCodexCliFixedExecutor,
  shouldShowOplConversationModelSelector,
  shouldShowOplConversationPermissionModeSelector,
  shouldShowOplCodexModelAutoOption,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import { parseError, resolveLocaleKey, uuid } from '@/common/utils';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import ConversationComposerContextStrip from '@/renderer/components/chat/composer/ConversationComposerContextStrip';
import type { ComposerCapabilityPaletteItem } from '@/renderer/components/chat/composer/ComposerCapabilityPalette';
import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
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
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useCanonicalCodexSettings } from '@/renderer/hooks/agent/useCanonicalCodexSettings';
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import { savePreferredMode } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import {
  getSendBoxDraftHook,
  mergeFailedSendDraft,
  type FileOrFolderItem,
} from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import {
  getPreparedRuntimeMode,
  getPreparedRuntimeModes,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { filterNonPermissionAccessModes } from '@/renderer/utils/model/agentModes';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import { Message, Tag } from '@arco-design/web-react';
import { Compass, Lightning, Link, MagicHat, Refresh, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { buildSendFailureError } from './buildSendFailureError';
import { useAcpInitialMessage } from './useAcpInitialMessage';
import type { UseAcpMessageReturn } from './useAcpMessage';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const configErrorMessageKey = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'agent.config.commandAck';
    if (error.message.includes('confirmation_timeout')) return 'agent.config.timeout';
    if (error.message.includes('config_update_in_progress')) return 'agent.config.busy';
  }
  return 'agent.config.failed';
};

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
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
    (failedContent: string, failedFiles: string[]) => {
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

const AcpSendBox: React.FC<{
  conversation_id: string;
  canonicalThreadId?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  workspacePath?: string;
  branch?: string;
  activeCapabilityLabel?: string;
  messageState: UseAcpMessageReturn;
}> = ({
  conversation_id,
  canonicalThreadId,
  backend,
  session_mode,
  agent_name,
  workspacePath,
  branch,
  activeCapabilityLabel,
  messageState,
}) => {
  const {
    running,
    hasHydratedRunningState,
    aiProcessing,
    setAiProcessing,
    resetState,
    hasThinkingMessage,
    slashCommands,
    fetchSlashCommands,
  } = messageState;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const teamPermission = useTeamPermission();
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const modelDisplayLocale = resolveLocaleKey(i18n.language) as OplModelDisplayLocale;
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const showModeSelector =
    backend === 'codex' && isOplCodexCliFixedExecutor() ? shouldShowOplConversationPermissionModeSelector() : true;
  const showConversationModelSelector =
    backend !== 'codex' || !isOplCodexCliFixedExecutor() || shouldShowOplConversationModelSelector();
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent, restoreFailedSend } =
    useSendBoxDraft(conversation_id);
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const [preparedModes, setPreparedModes] = useState<ReturnType<typeof getPreparedRuntimeModes>>([]);
  useEffect(() => {
    setPreparedModes([]);
  }, [backend, conversation_id]);
  const prepareRuntimeSync = useCallback(async () => {
    if (canonicalThreadId) return undefined;
    if (teamPermission) {
      await teamPermission.warmupSession();
    }
    return await warmupConversation(conversation_id);
  }, [canonicalThreadId, conversation_id, teamPermission]);

  const canonicalSettings = useCanonicalCodexSettings({
    conversationId: conversation_id,
    threadId: canonicalThreadId,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });
  const acpModelInfo = useAcpModelInfo({
    conversation_id,
    backend,
    prepareRuntime: prepareRuntimeSync,
    enabled: isMobile && !canonicalThreadId,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });
  const {
    model_info,
    canSwitch: canSwitchModel,
    isAutoModelSelection,
    selectModel,
    selectAutoModel,
    selectReasoningEffort,
    thoughtLevel,
    setStatus,
  } = canonicalSettings ?? acpModelInfo;
  useEffect(() => {
    if (canonicalSettings) setCurrentMode(canonicalSettings.permissionMode);
  }, [canonicalSettings]);
  const cachedAgentModes = useAgentModesForBackend(backend);
  const availableAgentModes = useMemo(() => {
    if (preparedModes.length === 0) return cachedAgentModes;
    return preparedModes;
  }, [cachedAgentModes, preparedModes]);
  const sessionModes = useMemo(() => filterNonPermissionAccessModes(availableAgentModes), [availableAgentModes]);
  const isModeSurfaceOpen = isMobile ? isMobileSheetOpen : isPaletteOpen;
  // Mirror AgentModeSelector's getMode sync so both compact surfaces show the live mode.
  useEffect(() => {
    if (!isModeSurfaceOpen) return;
    if (!conversation_id) return;
    if (canonicalSettings) {
      setCurrentMode(canonicalSettings.permissionMode);
      return;
    }
    let cancelled = false;
    void (async () => {
      const prepared = await prepareRuntimeSync();
      if (prepared) {
        const preparedMode = getPreparedRuntimeMode(prepared);
        const runtimeModes = getPreparedRuntimeModes(prepared);
        if (cancelled) return;
        if (preparedMode) {
          setPreparedModes(runtimeModes);
          setCurrentMode(preparedMode);
          return;
        }
      }
      const result = await ipcBridge.acpConversation.getMode.invoke({ conversation_id });
      if (!cancelled && result?.initialized !== false) {
        setCurrentMode(result.mode);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canonicalSettings, conversation_id, isModeSurfaceOpen, prepareRuntimeSync]);

  const handlePaletteModeChange = useCallback(
    async (mode: string) => {
      if (mode === currentMode) return;
      try {
        if (canonicalSettings) {
          const confirmedMode = await canonicalSettings.selectPermissionMode(mode);
          setCurrentMode(confirmedMode);
          if (backend) void savePreferredMode(backend, confirmedMode);
          Message.success(t('agentMode.switchSuccess'));
          return;
        }
        await prepareRuntimeSync();
        const confirmed = await ipcBridge.acpConversation.setMode.invoke({ conversation_id, mode });
        const confirmedMode = confirmed.mode || mode;
        setCurrentMode(confirmedMode);
        if (backend) void savePreferredMode(backend, confirmedMode);
        if (isLeaderInTeam) teamPermission?.propagateMode?.(confirmedMode);
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AcpSendBox] Failed to switch session mode via palette:', error);
        Message.error(t('agentMode.switchFailed'));
      }
    },
    [backend, canonicalSettings, conversation_id, currentMode, isLeaderInTeam, prepareRuntimeSync, t, teamPermission]
  );

  const currentCodexReasoningEffort =
    useOplCodexModelDisplay && thoughtLevel?.currentValue
      ? getOplCodexModelDisplayOptions().user_reasoning_effort_options.includes(
          thoughtLevel.currentValue as OplCodexReasoningEffort
        )
        ? (thoughtLevel.currentValue as OplCodexReasoningEffort)
        : defaultCodexReasoningEffort
      : ((thoughtLevel?.currentValue as OplCodexReasoningEffort | null | undefined) ?? defaultCodexReasoningEffort);
  const isSettingReasoning = setStatus.state === 'setting' && setStatus.optionId === thoughtLevel?.id;
  const isSettingConfig = setStatus.state === 'setting';
  const showCodexAutoOption =
    backend === 'codex' && isOplCodexCliFixedExecutor() && shouldShowOplCodexModelAutoOption();

  const handleSheetReasoningSelect = useCallback(
    (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isSettingReasoning) return;
      void selectReasoningEffort(value)
        .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
        .catch((error) => Message.error(t(configErrorMessageKey(error))));
    },
    [isSettingReasoning, selectReasoningEffort, thoughtLevel, t]
  );

  const handleSheetAutoSelect = useCallback(() => {
    if (!model_info || isSettingConfig) return;
    void selectAutoModel().catch(() => {});
  }, [isSettingConfig, model_info, selectAutoModel]);

  // In team mode, warmup the agent then fetch slash commands
  useEffect(() => {
    if (!teamPermission) return;
    void teamPermission
      .warmupSession()
      .then(() => warmupConversation(conversation_id))
      .then(() => {
        fetchSlashCommands();
      })
      .catch((error) => {
        Message.error(getConversationRuntimeWorkspaceErrorMessage(error, t));
      });
  }, [teamPermission, conversation_id, fetchSlashCommands, t]);

  const handleContentChange = useCallback(
    (val: string) => {
      if (val && teamPermission) teamPermission.warmupSession();
      setContent(val);
    },
    [teamPermission, setContent]
  );
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const runtimeView = useConversationRuntimeView(conversation_id, canonicalThreadId);

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const isBusy = runtimeView.isProcessing || !runtimeView.canSendMessage || running || aiProcessing;

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
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

  // Check for and send initial message from guid page
  useAcpInitialMessage({
    conversation_id: conversation_id,
    backend,
    workspacePath,
    disabled: Boolean(canonicalThreadId),
    setAiProcessing,
    resetState,
    markSendStarted: runtimeView.markSendStarted,
    markSendAccepted: runtimeView.markSendAccepted,
    markSendFailed: runtimeView.markSendFailed,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
    restoreFailedSend,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      runtimeView.markSendStarted();
      setAiProcessing(true);

      try {
        if (teamPermission && !canonicalThreadId) await teamPermission.warmupSession();
        void checkAndUpdateTitle(conversation_id, input);
        if (canonicalThreadId) {
          const msgId = uuid();
          addOrUpdateMessageRef.current(
            {
              id: msgId,
              msg_id: msgId,
              conversation_id,
              type: 'text',
              position: 'right',
              created_at: Date.now(),
              content: { content: displayMessage },
            },
            true
          );
          const result = await ipcBridge.codexThreads.startTurn.invoke({
            threadId: canonicalThreadId,
            conversationId: conversation_id,
            input: displayMessage,
            files,
            msgId,
            model: model_info?.current_model_id ?? getOplDefaultCodexModel(),
            effort: currentCodexReasoningEffort,
            permissionMode: currentMode,
          });
          runtimeView.markSendAccepted(
            result.turnId,
            {
              state: 'running',
              can_send_message: false,
              has_task: true,
              task_status: 'running',
              is_processing: true,
              pending_confirmations: 0,
              turn_id: result.turnId,
            },
            result.msgId
          );
        } else {
          const result = await ipcBridge.acpConversation.sendMessage.invoke({
            input: displayMessage,
            conversation_id,
            files,
          });
          runtimeView.markSendAccepted(result.turn_id, result.runtime, result.msg_id);
        }
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        runtimeView.markSendFailed(errorMsg);

        // Archived conversation (e.g. legacy Gemini). Backend signals this
        // via HTTP 410 + code='CONVERSATION_ARCHIVED' — identified by code,
        // not by substring matching.
        if (isBackendHttpError(error) && error.code === 'CONVERSATION_ARCHIVED') {
          Message.error({
            content: error.backendMessage || errorMsg,
            duration: 6000,
          });
          setAiProcessing(false);
          throw error;
        }

        const isAuthError =
          errorMsg.includes('[ACP-AUTH-') ||
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('认证失败');
        if (isAuthError) {
          const errorMessage = {
            id: uuid(),
            msg_id: uuid(),
            turn_id: '',
            conversation_id,
            type: 'error',
            data: t('acp.auth.failed', {
              backend,
              error: errorMsg,
              defaultValue: `${backend} authentication failed:

{{error}}

Please check your local CLI tool authentication status`,
            }),
          };

          ipcBridge.acpConversation.responseStream.emit(errorMessage);
        } else {
          addOrUpdateMessageRef.current(
            {
              id: uuid(),
              msg_id: uuid(),
              type: 'tips',
              position: 'center',
              conversation_id,
              created_at: Date.now(),
              content: {
                content: errorMsg,
                type: 'error',
                error: buildSendFailureError(error, errorMsg),
              },
            },
            true
          );
        }

        resetState();
        setAiProcessing(false);
        throw error;
      }

      if (files.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [
      backend,
      canonicalThreadId,
      checkAndUpdateTitle,
      conversation_id,
      currentCodexReasoningEffort,
      currentMode,
      model_info?.current_model_id,
      resetState,
      runtimeView,
      setAiProcessing,
      t,
      teamPermission,
      workspacePath,
    ]
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

  const onSendHandler = async (message: string) => {
    const allFiles = collectSelectedFiles(uploadFile, atPath);

    clearFiles();
    emitter.emit('acp.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy,
        hasPendingCommands,
      })
    ) {
      const queued = enqueue({ input: message, files: allFiles });
      if (!queued) restoreFailedSend(message, allFiles);
      return;
    }

    try {
      await executeCommand({ input: message, files: allFiles });
    } catch (error) {
      restoreFailedSend(message, allFiles);
      throw error;
    }
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('acp.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
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
          options: loadedSkills.map((name) => ({ key: name, label: name })),
          selectable: false,
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
          options: loadedMcpStatuses.map((status) => ({
            key: status.id,
            label: status.name,
            description: status.reason,
            disabled: true,
          })),
          selectable: false,
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

    const sessionModeValues = new Set(sessionModes.map((mode) => mode.value));
    const permissionModes = availableAgentModes.filter((mode) => !sessionModeValues.has(mode.value));
    const permissionOptions: MobileActionSheetOption[] = showModeSelector
      ? permissionModes.map((mode) => ({
          key: mode.value,
          label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
          description: mode.description,
          active: currentMode === mode.value,
        }))
      : [];
    if (permissionOptions.length > 0) {
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

    const autoModelOption =
      useOplCodexModelDisplay && model_info?.available_models.length
        ? buildOplCodexAutoModelOption({ modelInfo: model_info, localeKey: modelDisplayLocale })
        : null;
    const fixedModelOptions: MobileActionSheetOption[] = canSwitchModel
      ? [
          ...(useOplCodexModelDisplay && showCodexAutoOption && autoModelOption
            ? [
                {
                  key: '__auto',
                  label: autoModelOption.label,
                  description: autoModelOption.description,
                  active: isAutoModelSelection,
                  disabled: isSettingConfig,
                },
              ]
            : []),
          ...(model_info?.available_models ?? []).map((model) => {
            const modelDisplay = useOplCodexModelDisplay
              ? formatOplCodexModelDisplay({
                  id: model.id,
                  label: model.label,
                  reasoningEffort: currentCodexReasoningEffort,
                  localeKey: modelDisplayLocale,
                })
              : null;
            return {
              key: model.id,
              label: modelDisplay?.label ?? (model.label || model.id),
              description: modelDisplay?.description,
              active: !isAutoModelSelection && model_info?.current_model_id === model.id,
              disabled: isSettingConfig,
            };
          }),
        ]
      : [];
    const reasoningOptions: MobileActionSheetOption[] = thoughtLevel
      ? thoughtLevel.options
          .filter(
            (option) =>
              !useOplCodexModelDisplay ||
              getOplCodexModelDisplayOptions().user_reasoning_effort_options.includes(
                option.value as OplCodexReasoningEffort
              )
          )
          .map((option) => ({
            key: option.value,
            label: formatOplCodexReasoningMenuLabel(option.value, modelDisplayLocale),
            description: option.description,
            active:
              option.value === (useOplCodexModelDisplay ? currentCodexReasoningEffort : thoughtLevel.currentValue),
          }))
      : [];
    const currentModel = model_info?.available_models.find((model) => model.id === model_info.current_model_id);
    const currentModelLabel =
      useOplCodexModelDisplay && currentModel
        ? formatOplCodexModelDisplay({
            id: currentModel.id,
            label: currentModel.label,
            reasoningEffort: currentCodexReasoningEffort,
            localeKey: modelDisplayLocale,
          }).modelLabel
        : model_info?.current_model_label || model_info?.current_model_id || t('conversation.welcome.useCliModel');
    const currentReasoningLabel =
      currentCodexReasoningEffort === null || currentCodexReasoningEffort === undefined
        ? undefined
        : formatOplCodexReasoningMenuLabel(currentCodexReasoningEffort, modelDisplayLocale);

    const reasoningTitle =
      modelDisplayLocale === 'en-US'
        ? getOplCodexModelDisplayOptions().reasoning_menu_title_en
        : getOplCodexModelDisplayOptions().reasoning_menu_title_zh;
    const modelEntry: MobileActionSheetEntry | null =
      fixedModelOptions.length > 0
        ? {
            key: 'model',
            label: t('common.model', { defaultValue: 'Model' }),
            meta: currentModelLabel,
            disabled: isSettingConfig,
            submenu: {
              title: t('common.model', { defaultValue: 'Model' }),
              options: fixedModelOptions,
              onSelect: (modelId) => {
                if (modelId === '__auto') handleSheetAutoSelect();
                else selectModel(modelId);
              },
            },
          }
        : null;
    const reasoningEntry: MobileActionSheetEntry | null =
      reasoningOptions.length > 0
        ? {
            key: 'reasoning',
            label: reasoningTitle,
            meta: currentReasoningLabel,
            disabled: isSettingConfig,
            submenu: {
              title: reasoningTitle,
              options: reasoningOptions,
              onSelect: handleSheetReasoningSelect,
            },
          }
        : null;

    if (useOplCodexModelDisplay) {
      if (modelEntry) entries.push(modelEntry);
      if (reasoningEntry) entries.push(reasoningEntry);
      if (showCodexAutoOption && autoModelOption && canSwitchModel && thoughtLevel) {
        entries.push({
          key: 'reset-session-defaults',
          label: t('agent.sessionConfiguration.resetDefaults'),
          trailingIcon: <Refresh {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />,
          dividerBefore: true,
          disabled: isSettingConfig,
          onClick: handleSheetAutoSelect,
        });
      }
    } else {
      if (reasoningEntry) entries.push(reasoningEntry);
      if (modelEntry) entries.push(modelEntry);
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
    attachEntries,
    availableAgentModes,
    canSwitchModel,
    currentCodexReasoningEffort,
    currentMode,
    handlePaletteModeChange,
    handleSheetAutoSelect,
    handleSheetReasoningSelect,
    isMobile,
    isAutoModelSelection,
    isSettingConfig,
    isSettingReasoning,
    loadedMcpStatuses,
    loadedSkills,
    modelDisplayLocale,
    model_info,
    navigate,
    selectModel,
    sessionModeItems,
    sessionModes,
    showCodexAutoOption,
    showModeSelector,
    t,
    thoughtLevel,
    useOplCodexModelDisplay,
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

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Cancelling is best-effort: swallow errors (e.g. backend WS not yet
    // connected → 409) so they don't bubble up as unhandled rejections.
    // UI state is still reset via finally.
    const turnId = runtimeView.activeTurnId;
    if (!turnId) {
      resetState();
      resetActiveExecution('stop');
      return;
    }
    try {
      await runtimeView.stopActiveTurn();
    } catch (error) {
      console.warn('[AcpSendBox] stop request failed', error);
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
      <ThoughtDisplay running={isBusy} onStop={handleStop} />
      <ConversationComposerContextStrip
        workspacePath={workspacePath}
        branch={branch}
        activeCapabilityLabel={activeCapabilityLabel}
      />

      <SendBox
        onMobilePlusClick={isMobile ? () => setIsMobileSheetOpen(true) : undefined}
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={false}
        placeholder={t('conversation.chat.oplPlaceholder')}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={!isMobile}
        lockMultiLine={!isMobile}
        tools={composerCapabilityPalette}
        rightTools={
          !isMobile && (showConversationModelSelector || showModeSelector) ? (
            <div className='sendbox-decision-controls' data-testid='acp-sendbox-decision-controls'>
              {showConversationModelSelector && (
                <div className='sendbox-decision-control'>
                  <AcpModelSelector
                    conversation_id={conversation_id}
                    backend={backend}
                    waitForWarmup={!canonicalThreadId}
                    modelInfoController={canonicalSettings ?? undefined}
                  />
                </div>
              )}
              {showModeSelector && (
                <div className='sendbox-decision-control'>
                  <AgentModeSelector
                    backend={backend}
                    conversation_id={canonicalThreadId ? undefined : conversation_id}
                    compact
                    initialMode={canonicalSettings?.permissionMode ?? session_mode}
                    onModeSelect={
                      canonicalSettings
                        ? (mode) => {
                            void canonicalSettings.selectPermissionMode(mode).then(setCurrentMode);
                          }
                        : undefined
                    }
                    compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                    modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                    compactLabelPrefix={t('agentMode.permission')}
                    onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
                    beforeRuntimeSync={prepareRuntimeSync}
                  />
                </div>
              )}
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
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('acp.selected.file', newAtPath);
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
        slash_commands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
        compactActions={false}
      ></SendBox>
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

export default AcpSendBox;
