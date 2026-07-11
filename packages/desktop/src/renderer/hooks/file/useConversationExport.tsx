import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import type { SlashCommandMenuItem } from '@/renderer/components/chat/SlashCommandMenu';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import {
  type ConversationExportFormat,
  type ExportTranscriptLabels,
  buildConversationExportContent,
  buildDefaultExportFileName,
  fetchAllConversationMessages,
  getDefaultExportFileNameSource,
  joinFilePath,
  normalizeExportFileName,
} from '@/renderer/utils/chat/conversationExport';
import { copyText } from '@/renderer/utils/ui/clipboard';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

type ExportFlowStep = 'closed' | 'menu' | 'filename';

type MessageApi = {
  success?: (content: ReactNode | { content: ReactNode; duration?: number }) => void;
  error?: (content: ReactNode | { content: ReactNode; duration?: number }) => void;
};

type UseConversationExportOptions = {
  conversation_id?: string;
  workspace?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  messageApi: MessageApi;
};

export type UseConversationExportResult = {
  step: ExportFlowStep;
  activeIndex: number;
  format: ConversationExportFormat;
  filename: string;
  directory: string;
  loading: boolean;
  menuItems: SlashCommandMenuItem[];
  isOpen: boolean;
  pathPreview: string;
  openExportFlow: () => Promise<void>;
  closeExportFlow: () => void;
  showMenu: () => void;
  setFormat: (value: ConversationExportFormat) => void;
  setFilename: (value: string) => void;
  selectDirectory: () => Promise<void>;
  setActiveIndex: (value: number) => void;
  onSelectMenuItem: (key: string) => void;
  handleKeyDown: (event: ReactKeyboardEvent) => boolean;
  submitFilename: () => Promise<void>;
};

export function useConversationExport(options: UseConversationExportOptions): UseConversationExportResult {
  const { conversation_id, workspace, t, messageApi } = options;
  const [step, setStep] = useState<ExportFlowStep>('closed');
  const [activeIndex, setActiveIndex] = useState(0);
  const [format, setFormatState] = useState<ConversationExportFormat>('markdown');
  const [filename, setFilename] = useState('');
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(false);
  const conversationRef = useRef<TChatConversation | null>(null);
  const directoryRef = useRef('');
  const messagesRef = useRef<TMessage[] | null>(null);
  const exportedAtRef = useRef('');
  const transcriptRef = useRef<Partial<Record<ConversationExportFormat, string>>>({});
  const transcriptLabels = useMemo<ExportTranscriptLabels>(
    () => ({
      conversation: t('messages.export.conversationLabel'),
      exportedAt: t('messages.export.exportedAtLabel'),
      noMessages: t('messages.export.noMessages'),
      redactionNotice: t('messages.export.redactionNotice'),
      user: t('messages.export.userLabel'),
      assistant: t('messages.export.assistantLabel'),
    }),
    [t]
  );

  const closeExportFlow = useCallback(() => {
    setStep('closed');
    setActiveIndex(0);
    setLoading(false);
  }, []);

  const showMenu = useCallback(() => {
    setStep('menu');
    setActiveIndex(0);
  }, []);

  const setFormat = useCallback((value: ConversationExportFormat) => {
    setFormatState(value);
    setFilename((current) => normalizeExportFileName(current, value));
  }, []);

  const loadConversation = useCallback(async (): Promise<TChatConversation | null> => {
    if (!conversation_id) {
      return null;
    }
    if (conversationRef.current?.id === conversation_id) {
      return conversationRef.current;
    }

    const conversation = await getConversationOrNull(conversation_id);
    conversationRef.current = conversation;
    transcriptRef.current = {};
    return conversation;
  }, [conversation_id]);

  const loadMessages = useCallback(async (): Promise<TMessage[]> => {
    if (!conversation_id) {
      return [];
    }
    if (messagesRef.current) {
      return messagesRef.current;
    }

    const messages = await fetchAllConversationMessages(({ page, page_size }) =>
      ipcBridge.database.getConversationMessages.invoke({
        conversation_id,
        page,
        page_size,
        order: 'ASC',
        content_mode: 'compact',
      })
    );
    messagesRef.current = messages;
    transcriptRef.current = {};
    return messages;
  }, [conversation_id]);

  const loadTranscript = useCallback(
    async (targetFormat: ConversationExportFormat): Promise<string | null> => {
      if (!conversation_id) {
        return null;
      }
      if (transcriptRef.current[targetFormat]) {
        return transcriptRef.current[targetFormat] ?? null;
      }

      const conversation = await loadConversation();
      if (!conversation) {
        return null;
      }
      const messages = await loadMessages();
      const exportedAt = exportedAtRef.current || new Date().toISOString();
      exportedAtRef.current = exportedAt;
      const transcript = buildConversationExportContent(
        conversation,
        messages,
        targetFormat,
        transcriptLabels,
        exportedAt
      );
      transcriptRef.current[targetFormat] = transcript;
      return transcript;
    },
    [conversation_id, loadConversation, loadMessages, transcriptLabels]
  );

  const openExportFlow = useCallback(async () => {
    if (!conversation_id) {
      messageApi.error?.(t('messages.export.unavailable'));
      return;
    }

    setStep('closed');
    setLoading(true);
    try {
      conversationRef.current = null;
      messagesRef.current = null;
      transcriptRef.current = {};
      exportedAtRef.current = new Date().toISOString();
      directoryRef.current = '';
      setDirectory('');
      setFormatState('markdown');

      const conversation = await loadConversation();
      if (!conversation) {
        messageApi.error?.(t('messages.export.unavailable'));
        return;
      }
      const messages = await loadMessages();
      setFilename(buildDefaultExportFileName(getDefaultExportFileNameSource(conversation, messages), 'markdown'));
      setActiveIndex(0);
      setStep('menu');
    } catch (error) {
      console.error('[useConversationExport] Failed to open export flow:', error);
      messageApi.error?.(t('messages.export.prepareFailed'));
    } finally {
      setLoading(false);
    }
  }, [conversation_id, loadConversation, loadMessages, messageApi, t]);

  const handleCopy = useCallback(async () => {
    try {
      setLoading(true);
      const transcript = await loadTranscript('markdown');
      if (!transcript) {
        messageApi.error?.(t('messages.export.unavailable'));
        return;
      }
      await copyText(transcript);
      messageApi.success?.(t('messages.export.copySuccess'));
      closeExportFlow();
    } catch (error) {
      console.error('[useConversationExport] Failed to copy export:', error);
      messageApi.error?.(t('messages.export.copyFailed'));
    } finally {
      setLoading(false);
    }
  }, [closeExportFlow, loadTranscript, messageApi, t]);

  const selectDirectory = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      let defaultPath = directoryRef.current || workspace?.trim() || '';
      if (!defaultPath) {
        try {
          defaultPath = await ipcBridge.application.getPath.invoke({ name: 'desktop' });
        } catch {
          defaultPath = '';
        }
      }
      const selectedDirectories = await ipcBridge.dialog.showOpen.invoke({
        defaultPath: defaultPath || undefined,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selectedDirectory = selectedDirectories?.[0]?.trim();
      if (!selectedDirectory) {
        messageApi.error?.(t('messages.export.directoryCancelled'));
        return;
      }
      directoryRef.current = selectedDirectory;
      setDirectory(selectedDirectory);
    } catch (error) {
      console.error('[useConversationExport] Failed to select export directory:', error);
      messageApi.error?.(t('messages.export.directorySelectFailed'));
    } finally {
      setLoading(false);
    }
  }, [loading, messageApi, t, workspace]);

  const handleSave = useCallback(async () => {
    if (!directoryRef.current) {
      messageApi.error?.(t('messages.export.directoryRequired'));
      return;
    }

    try {
      setLoading(true);
      const transcript = await loadTranscript(format);
      if (!transcript) {
        messageApi.error?.(t('messages.export.unavailable'));
        return;
      }

      const normalizedFileName = normalizeExportFileName(filename, format);
      const targetPath = joinFilePath(directoryRef.current, normalizedFileName);
      const success = await ipcBridge.fs.writeFile.invoke({
        path: targetPath,
        data: transcript,
      });

      if (!success) {
        messageApi.error?.(t('messages.export.saveFailed'));
        return;
      }

      messageApi.success?.(t('messages.export.saveSuccess', { path: targetPath }));
      closeExportFlow();
    } catch (error) {
      console.error('[useConversationExport] Failed to save export:', error);
      messageApi.error?.(t('messages.export.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, [closeExportFlow, filename, format, loadTranscript, messageApi, t]);

  const onSelectMenuItem = useCallback(
    (key: string) => {
      if (loading) {
        return;
      }
      if (key === 'copy') {
        void handleCopy();
        return;
      }
      if (key === 'save') {
        setStep('filename');
      }
    },
    [handleCopy, loading]
  );

  const submitFilename = useCallback(async () => {
    if (loading) {
      return;
    }
    await handleSave();
  }, [handleSave, loading]);

  const menuItems = useMemo<SlashCommandMenuItem[]>(
    () => [
      {
        key: 'copy',
        label: t('messages.export.copyLabel'),
        description: t('messages.export.copyDescription'),
      },
      {
        key: 'save',
        label: t('messages.export.saveLabel'),
        description: t('messages.export.saveDescription'),
      },
    ],
    [t]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (step === 'closed') {
        return false;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (step === 'filename') {
          showMenu();
        } else {
          closeExportFlow();
        }
        return true;
      }

      if (step === 'menu') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % menuItems.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          return true;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const activeMenuItem = menuItems[activeIndex] ?? menuItems[0];
          if (activeMenuItem) {
            onSelectMenuItem(activeMenuItem.key);
          }
          return true;
        }
        return false;
      }

      if (step === 'filename' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submitFilename();
        return true;
      }

      return false;
    },
    [activeIndex, closeExportFlow, menuItems, onSelectMenuItem, showMenu, step, submitFilename]
  );

  return {
    step,
    activeIndex,
    format,
    filename,
    directory,
    loading,
    menuItems,
    isOpen: step !== 'closed',
    pathPreview: directory ? joinFilePath(directory, normalizeExportFileName(filename, format)) : '',
    openExportFlow,
    closeExportFlow,
    showMenu,
    setFormat,
    setFilename,
    selectDirectory,
    setActiveIndex,
    onSelectMenuItem,
    handleKeyDown,
    submitFilename,
  };
}
