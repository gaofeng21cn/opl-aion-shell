import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SendBox from '@/renderer/components/chat/SendBox';

const openExportFlow = vi.fn().mockResolvedValue(undefined);
let isMobileLayout = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      (
        ({
          'common.more': 'More',
          'common.send': 'Send',
          'conversation.currentTask.stop': 'Stop task',
        }) as Record<string, string>
      )[key] ??
      options?.defaultValue ??
      key,
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conversation-1' }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: isMobileLayout }),
}));
vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({ useTeamPermission: () => null }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({ useMessageList: () => [] }));
vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    step: 'closed',
    activeIndex: 0,
    menuItems: [],
    loading: false,
    openExportFlow,
    closeExportFlow: vi.fn(),
    handleKeyDown: () => false,
    setActiveIndex: vi.fn(),
    onSelectMenuItem: vi.fn(),
    format: 'markdown',
    filename: '',
    directory: '',
    pathPreview: '',
    setFormat: vi.fn(),
    setFilename: vi.fn(),
    selectDirectory: vi.fn(),
    showMenu: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));
vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));
vi.mock('@/renderer/hooks/file/useUploadState', () => ({ useUploadState: () => ({ isUploading: false }) }));
vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));
vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'transparent',
    inactiveBorderColor: 'transparent',
    activeShadow: 'none',
  }),
}));
vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({ appendSpeechTranscript: vi.fn() }));
vi.mock('@/renderer/components/chat/composer/SpeechInputButton', () => ({ default: () => null }));

function SendBoxHarness({
  initialValue = '',
  loading = false,
  onStop,
  onMobilePlusClick,
}: {
  initialValue?: string;
  loading?: boolean;
  onStop?: () => Promise<void>;
  onMobilePlusClick?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <SendBox
      value={value}
      onChange={setValue}
      onSend={async () => {}}
      loading={loading}
      onStop={onStop}
      onMobilePlusClick={onMobilePlusClick}
    />
  );
}

describe('SendBox transcript export command', () => {
  afterEach(() => {
    isMobileLayout = false;
  });

  it('opens the real command menu from the input and executes the /export builtin flow with Enter', async () => {
    openExportFlow.mockClear();
    render(<SendBoxHarness />);

    const input = screen.getByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: '/export' } });

    expect(await screen.findByRole('option', { name: /\/export/i })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(openExportFlow).toHaveBeenCalledTimes(1));
  });

  it('gives the icon-only send and stop controls stable accessible names', () => {
    const { rerender } = render(<SendBoxHarness initialValue='Ready' />);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('data-testid', 'sendbox-send-btn');

    rerender(<SendBoxHarness initialValue='Ready' loading onStop={async () => {}} />);
    expect(screen.getByRole('button', { name: 'Stop task' })).toHaveAttribute('data-testid', 'sendbox-stop-btn');
  });

  it('names the mobile action launcher and keeps it as a focusable native button', async () => {
    isMobileLayout = true;
    const onMobilePlusClick = vi.fn();
    const user = userEvent.setup();
    render(<SendBoxHarness onMobilePlusClick={onMobilePlusClick} />);

    const moreButton = screen.getByRole('button', { name: 'More' });
    expect(moreButton).toHaveAttribute('data-testid', 'sendbox-mobile-plus-btn');
    moreButton.focus();
    expect(moreButton).toHaveFocus();
    await user.click(moreButton);

    expect(onMobilePlusClick).toHaveBeenCalledTimes(1);
  });
});
