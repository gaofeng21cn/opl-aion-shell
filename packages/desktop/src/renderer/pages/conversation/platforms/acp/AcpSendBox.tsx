import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import { configService } from '@/common/config/configService';
import {
  filterOplOrdinaryMcpStatuses,
  filterOplOrdinarySkillNames,
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  getOplFlowContextPolicy,
  isOplCodexCliFixedExecutor,
  shouldShowOplConversationPermissionModeSelector,
  shouldShowOplCodexModelAutoOption,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import { parseError, resolveLocaleKey, uuid } from '@/common/utils';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
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
import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';
import { savePreferredMode } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
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
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import { Message, Tag } from '@arco-design/web-react';
import { Brain, MagicHat, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
const OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE = getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement;

const configErrorMessageKey = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'agent.config.commandAck';
    if (error.message.includes('confirmation_timeout')) return 'agent.config.timeout';
    if (error.message.includes('config_update_in_progress')) return 'agent.config.busy';
  }
  return 'agent.config.failed';
};

function oplRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
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

function readIntelligenceEnhancementPreference(): boolean {
  if (!OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) return false;
  return configService.get(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key) ?? false;
}

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
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  workspacePath?: string;
  messageState: UseAcpMessageReturn;
}> = ({ conversation_id, backend, session_mode, agent_name, workspacePath, messageState }) => {
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
  const teamPermission = useTeamPermission();
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const modelDisplayLocale = resolveLocaleKey(i18n.language) as OplModelDisplayLocale;
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const showModeSelector =
    backend === 'codex' && isOplCodexCliFixedExecutor() ? shouldShowOplConversationPermissionModeSelector() : true;
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
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
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const prepareRuntimeSync = useCallback(async () => {
    if (teamPermission) {
      await teamPermission.warmupSession();
    }
    await warmupConversation(conversation_id);
  }, [conversation_id, teamPermission]);

  // Drive the mobile sheet's model entry off the same source AcpModelSelector uses
  const {
    model_info,
    canSwitch: canSwitchModel,
    selectModel,
    selectAutoModel,
    thoughtLevel,
    setStatus,
    setConfigOption,
  } = useAcpModelInfo({
    conversation_id,
    backend,
    prepareRuntime: prepareRuntimeSync,
    enabled: isMobile,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });
  const availableAgentModes = useAgentModesForBackend(backend);
  const [oplFlowIntelligenceEnhancementMode, setOplFlowIntelligenceEnhancementMode] = useState(
    readIntelligenceEnhancementPreference
  );
  const [oplFlowIntelligenceEnhancementApplying, setOplFlowIntelligenceEnhancementApplying] = useState(false);
  const refreshOplFlowIntelligenceEnhancementStatus = useCallback(async () => {
    const mode = OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE;
    if (!mode || !useOplCodexModelDisplay) return;
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: mode.status_action_id,
        dryRun: false,
      });
      if (result.ok === false) return;
      const enabled = readIntelligenceEnhancementEnabled(result.parsed);
      if (enabled === null) return;
      setOplFlowIntelligenceEnhancementMode(enabled);
      configService.setLocal(mode.settings_key, enabled);
    } catch {
      // The sheet can still use the cached preference when runtime status is unavailable.
    }
  }, [useOplCodexModelDisplay]);

  useEffect(() => {
    if (!OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) return;
    setOplFlowIntelligenceEnhancementMode(readIntelligenceEnhancementPreference());
    return configService.subscribe(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.settings_key, (value) => {
      setOplFlowIntelligenceEnhancementMode(value === false ? false : true);
    });
  }, []);

  useEffect(() => {
    if (!isMobile || !isMobileSheetOpen) return;
    void refreshOplFlowIntelligenceEnhancementStatus();
  }, [isMobile, isMobileSheetOpen, refreshOplFlowIntelligenceEnhancementStatus]);

  // Mirror AgentModeSelector's getMode sync so the sheet shows the live mode label.
  useEffect(() => {
    if (!isMobile || !isMobileSheetOpen) return;
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
  }, [conversation_id, isMobile, isMobileSheetOpen, prepareRuntimeSync]);

  const handleSheetModeChange = useCallback(
    async (mode: string) => {
      if (mode === currentMode) return;
      try {
        await prepareRuntimeSync();
        const confirmed = await ipcBridge.acpConversation.setMode.invoke({ conversation_id, mode });
        const confirmedMode = confirmed.mode || mode;
        setCurrentMode(confirmedMode);
        if (backend) void savePreferredMode(backend, confirmedMode);
        if (isLeaderInTeam) teamPermission?.propagateMode?.(confirmedMode);
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AcpSendBox] Failed to switch mode via sheet:', error);
        Message.error(t('agentMode.switchFailed'));
      }
    },
    [backend, conversation_id, currentMode, isLeaderInTeam, prepareRuntimeSync, t, teamPermission]
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
  const showCodexAutoOption =
    backend === 'codex' && isOplCodexCliFixedExecutor() && shouldShowOplCodexModelAutoOption();

  const handleSheetReasoningSelect = useCallback(
    (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isSettingReasoning) return;
      void setConfigOption(thoughtLevel.id, value)
        .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
        .catch((error) => Message.error(t(configErrorMessageKey(error))));
    },
    [isSettingReasoning, setConfigOption, thoughtLevel, t]
  );

  const handleSheetAutoSelect = useCallback(() => {
    if (!model_info || isSettingReasoning) return;
    void selectAutoModel().catch(() => {});
  }, [isSettingReasoning, model_info, selectAutoModel]);

  const handleSheetIntelligenceEnhancementSelect = useCallback(
    async (key: string) => {
      const mode = OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE;
      if (!mode || oplFlowIntelligenceEnhancementApplying) return;
      const checked = key === 'enable';
      if (checked === oplFlowIntelligenceEnhancementMode) return;
      const previous = oplFlowIntelligenceEnhancementMode;
      setOplFlowIntelligenceEnhancementMode(checked);
      setOplFlowIntelligenceEnhancementApplying(true);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: checked ? mode.enable_action_id : mode.disable_action_id,
          dryRun: false,
        });
        if (result.ok === false) {
          throw new Error(result.error?.message || 'OPL Flow intelligence enhancement action failed');
        }
        const enabled = readIntelligenceEnhancementEnabled(result.parsed) ?? checked;
        setOplFlowIntelligenceEnhancementMode(enabled);
        await configService.set(mode.settings_key, enabled);
      } catch (caughtError) {
        setOplFlowIntelligenceEnhancementMode(previous);
        configService.setLocal(mode.settings_key, previous);
        Message.error(caughtError instanceof Error ? caughtError.message : String(caughtError));
      } finally {
        setOplFlowIntelligenceEnhancementApplying(false);
      }
    },
    [oplFlowIntelligenceEnhancementApplying, oplFlowIntelligenceEnhancementMode]
  );

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
  const runtimeView = useConversationRuntimeView(conversation_id);

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
    setAiProcessing,
    resetState,
    markSendStarted: runtimeView.markSendStarted,
    markSendAccepted: runtimeView.markSendAccepted,
    markSendFailed: runtimeView.markSendFailed,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      runtimeView.markSendStarted();
      setAiProcessing(true);

      try {
        if (teamPermission) await teamPermission.warmupSession();
        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files,
        });
        runtimeView.markSendAccepted(result.turn_id, result.runtime, result.msg_id);
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
    [backend, checkAndUpdateTitle, conversation_id, resetState, runtimeView, setAiProcessing, t, workspacePath]
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
    const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path));
    const allFiles = [...uploadFile, ...atPathFiles];

    clearFiles();
    emitter.emit('acp.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: allFiles });
      return;
    }

    await executeCommand({ input: message, files: allFiles });
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
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const { entries: attachEntries, hiddenFileInput: attachHiddenInput } = useAttachEntry({
    openFileSelector,
    onLocalFilesAdded: handleFilesAdded,
  });

  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const modeOptions: MobileActionSheetOption[] = showModeSelector
      ? availableAgentModes.map((mode) => ({
          key: mode.value,
          label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
          description: mode.description,
          active: currentMode === mode.value,
        }))
      : [];

    const autoModelOption =
      useOplCodexModelDisplay && model_info?.available_models.length
        ? buildOplCodexAutoModelOption({
            availableModels: model_info.available_models,
            localeKey: modelDisplayLocale,
          })
        : null;
    const fixedModelOptions: MobileActionSheetOption[] = canSwitchModel
      ? (model_info?.available_models ?? []).map((model) => {
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
            active: model_info?.current_model_id === model.id,
          };
        })
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
    const currentModeLabel =
      modeOptions.find((opt) => opt.active)?.label ?? t('agentMode.default', { defaultValue: 'Default' });
    const intelligenceEnhancementLabel = OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE
      ? t(OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE.label_key, {
          defaultValue: modelDisplayLocale === 'en-US' ? 'Intelligence enhancement mode' : '智力增强模式',
        })
          .replace(/\s+mode$/i, '')
          .replace(/模式$/, '')
      : '';
    const intelligenceEnhancementOnLabel =
      modelDisplayLocale === 'en-US'
        ? t('settings.capabilitiesPage.packageManager.actions.enable', { defaultValue: 'Enable' })
        : t('settings.capabilitiesPage.packageManager.actions.enable', { defaultValue: '启用' }).replace(
            /^启用$/,
            '开启'
          );
    const intelligenceEnhancementOffLabel =
      modelDisplayLocale === 'en-US'
        ? t('settings.capabilitiesPage.packageManager.actions.disable', { defaultValue: 'Disable' })
        : t('common.close', { defaultValue: '关闭' });

    const entries: MobileActionSheetEntry[] = [];

    if (showCodexAutoOption && autoModelOption && canSwitchModel && thoughtLevel) {
      entries.push({
        key: 'auto',
        icon: <MagicHat theme='outline' size='16' />,
        label: autoModelOption.label,
        description: autoModelOption.description,
        disabled: isSettingReasoning,
        onClick: handleSheetAutoSelect,
      });
    }

    if (reasoningOptions.length > 0) {
      entries.push({
        key: 'reasoning',
        icon: <Brain theme='outline' size='16' />,
        label:
          modelDisplayLocale === 'en-US'
            ? getOplCodexModelDisplayOptions().reasoning_menu_title_en
            : getOplCodexModelDisplayOptions().reasoning_menu_title_zh,
        meta: currentReasoningLabel,
        disabled: isSettingReasoning,
        submenu: {
          title:
            modelDisplayLocale === 'en-US'
              ? getOplCodexModelDisplayOptions().reasoning_menu_title_en
              : getOplCodexModelDisplayOptions().reasoning_menu_title_zh,
          options: reasoningOptions,
          onSelect: handleSheetReasoningSelect,
        },
      });
    }

    // Model entry: fixed model selection only. Auto stays as its own entry.
    if (fixedModelOptions.length > 0) {
      entries.push({
        key: 'model',
        icon: <Brain theme='outline' size='16' />,
        label: t('common.model', { defaultValue: 'Model' }),
        meta: currentModelLabel,
        submenu: {
          title: t('common.model', { defaultValue: 'Model' }),
          options: fixedModelOptions,
          onSelect: (id) => {
            selectModel(id);
          },
        },
      });
    }

    if (OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE) {
      entries.push({
        key: 'intelligence-enhancement',
        icon: <MagicHat theme='outline' size='16' />,
        label: intelligenceEnhancementLabel,
        meta: oplFlowIntelligenceEnhancementMode ? intelligenceEnhancementOnLabel : intelligenceEnhancementOffLabel,
        disabled: oplFlowIntelligenceEnhancementApplying,
        submenu: {
          title: intelligenceEnhancementLabel,
          options: [
            {
              key: 'enable',
              label: intelligenceEnhancementOnLabel,
              active: oplFlowIntelligenceEnhancementMode,
            },
            {
              key: 'disable',
              label: intelligenceEnhancementOffLabel,
              active: !oplFlowIntelligenceEnhancementMode,
            },
          ],
          onSelect: (key) => void handleSheetIntelligenceEnhancementSelect(key),
        },
      });
    }

    if (modeOptions.length > 0) {
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: currentModeLabel,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
          onSelect: (key) => void handleSheetModeChange(key),
        },
      });
    }

    attachEntries.forEach((entry, idx) => {
      entries.push({
        ...entry,
        dividerBefore: idx === 0 ? entries.length > 0 : false,
      });
    });

    if (loadedSkills.length > 0) {
      const skillOptions: MobileActionSheetOption[] = loadedSkills.map((name) => ({
        key: name,
        label: `/${name}`,
      }));
      entries.push({
        key: 'skills',
        icon: <MagicHat theme='outline' size='16' />,
        label: t('common.skills', { defaultValue: 'Skills' }),
        variant: 'muted',
        submenu: {
          title: t('common.skills', { defaultValue: 'Skills' }),
          selectable: false,
          options: skillOptions,
          onSelect: (name) => {
            setContent(`/${name} `);
          },
        },
      });
    }

    if (loadedMcpStatuses.length > 0) {
      const mcpOptions: MobileActionSheetOption[] = loadedMcpStatuses.map((item) => ({
        key: item.id,
        label: item.name,
        description:
          item.status === 'loaded'
            ? undefined
            : item.reason
              ? `${t(`conversation.mcp.status.${item.status}` as const)} · ${item.reason}`
              : t(`conversation.mcp.status.${item.status}` as const),
      }));
      entries.push({
        key: 'mcp',
        icon: <Shield theme='outline' size='16' />,
        label: t('conversation.mcp.loaded', { defaultValue: 'Loaded MCP' }),
        variant: 'muted',
        submenu: {
          title: t('conversation.mcp.loaded', { defaultValue: 'Loaded MCP' }),
          selectable: false,
          options: mcpOptions,
          onSelect: () => undefined,
        },
      });
    }

    return entries;
  }, [
    attachEntries,
    availableAgentModes,
    canSwitchModel,
    currentMode,
    currentCodexReasoningEffort,
    handleSheetModeChange,
    handleSheetAutoSelect,
    handleSheetIntelligenceEnhancementSelect,
    handleSheetReasoningSelect,
    isMobile,
    isSettingReasoning,
    loadedMcpStatuses,
    loadedSkills,
    modelDisplayLocale,
    model_info,
    oplFlowIntelligenceEnhancementApplying,
    oplFlowIntelligenceEnhancementMode,
    selectModel,
    setContent,
    showModeSelector,
    showCodexAutoOption,
    t,
    thoughtLevel,
    useOplCodexModelDisplay,
  ]);

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
    runtimeView.markStopRequested(turnId);
    try {
      const result = await ipcBridge.conversation.stop.invoke({ conversation_id, turn_id: turnId });
      runtimeView.markStopAcknowledged(turnId, result.runtime);
    } catch (error) {
      console.warn('[AcpSendBox] stop request failed', error);
      runtimeView.resetLocalGate('stop_failed');
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
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
        placeholder={t('acp.sendbox.placeholder', {
          backend: agent_name || backend,
          defaultValue: `Send message to {{backend}}...`,
        })}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={!isMobile}
        lockMultiLine={!isMobile}
        tools={
          <FileAttachButton
            openFileSelector={openFileSelector}
            onLocalFilesAdded={handleFilesAdded}
            loadedMcpStatuses={loadedMcpStatuses}
          />
        }
        rightTools={
          showModeSelector ? (
            <AgentModeSelector
              backend={backend}
              conversation_id={conversation_id}
              compact
              initialMode={session_mode}
              compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
              modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
              compactLabelPrefix={t('agentMode.permission')}
              hideCompactLabelPrefixOnMobile
              onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
              beforeRuntimeSync={prepareRuntimeSync}
            />
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
      {isMobile && (
        <>
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('common.more', { defaultValue: 'More' })}
            entries={sheetEntries}
          />
          {attachHiddenInput}
        </>
      )}
    </div>
  );
};

export default AcpSendBox;
