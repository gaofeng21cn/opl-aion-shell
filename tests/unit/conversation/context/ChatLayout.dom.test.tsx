import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layout = vi.hoisted(() => ({ isMobile: false }));
const viewport = vi.hoisted(() => ({ width: 1200 }));
const preview = vi.hoisted(() => ({ isOpen: false, openRequestId: 0 }));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layout,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  PreviewPanel: () => <div data-testid='preview-panel'>Preview body</div>,
  usePreviewContext: () => preview,
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: ({ storageKey }: { storageKey: string }) => ({
    splitRatio: storageKey === 'chat-workspace-width-px' ? 380 : 60,
    setSplitRatio: vi.fn(),
    createDragHandle: () => <div data-testid={`resize-${storageKey}`} />,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: viewport.width }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [] }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useTitleRename', () => ({
  useTitleRename: () => ({
    editingTitle: false,
    setEditingTitle: vi.fn(),
    titleDraft: '',
    setTitleDraft: vi.fn(),
    renameLoading: false,
    canRenameTitle: false,
    submitTitleRename: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatTitleEditor', () => ({
  default: ({ leading, title }: { leading?: React.ReactNode; title?: React.ReactNode }) => (
    <div data-testid='chat-title'>
      {leading}
      {title}
    </div>
  ),
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({ AgentLogoIcon: () => <span /> }));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay', () => ({
  default: ({ rightSiderCollapsed, sider }: { rightSiderCollapsed: boolean; sider: React.ReactNode }) => (
    <div data-testid='mobile-side-panel' data-collapsed={String(rightSiderCollapsed)}>
      {sider}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.sidePanel.open': 'Open files',
        'conversation.sidePanel.close': 'Close files',
        'conversation.sidePanel.title': 'Files & changes',
        'conversation.navigation.back': 'Back',
        'conversation.navigation.forward': 'Forward',
      })[key] ?? key,
  }),
}));

const previewTransitionView = () => (
  <ChatLayout title='Conversation' conversation_id='conversation-1' sider={<div>Preview surface</div>}>
    <div>Timeline</div>
  </ChatLayout>
);

describe('ChatLayout conversation context surfaces', () => {
  beforeEach(() => {
    layout.isMobile = false;
    viewport.width = 1200;
    preview.isOpen = false;
    preview.openRequestId = 0;
    localStorage.clear();
    document.getElementById('app-titlebar-actions-slot')?.remove();
  });

  it('keeps the side panel closed until its header control is activated from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <ChatLayout
        title='Conversation'
        conversation_id='conversation-1'
        environmentSlot={<div data-testid='environment'>Environment</div>}
        sider={
          <div className='chat-workspace' data-testid='side-content' tabIndex={0}>
            Side content
          </div>
        }
      >
        <div>Timeline</div>
      </ChatLayout>
    );

    expect(screen.getByTestId('environment')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Open files' });
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('complementary')).toBeTruthy();
    expect(screen.getByTestId('side-content')).toBeTruthy();
    expect(screen.getByTestId('resize-chat-workspace-width-px')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('side-content')).toHaveFocus());
    expect(screen.getByTestId('environment').closest('[data-testid="conversation-header-tools"]')).toBeTruthy();
  });

  it('uses a closed mobile overlay and opens it from the titlebar action', async () => {
    layout.isMobile = true;
    const slot = document.createElement('div');
    slot.id = 'app-titlebar-actions-slot';
    document.body.appendChild(slot);

    render(
      <ChatLayout
        title='Conversation'
        conversation_id='conversation-1'
        environmentSlot={<div data-testid='mobile-environment'>Environment</div>}
        sider={<div>Side content</div>}
      >
        <div>Timeline</div>
      </ChatLayout>
    );

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open files' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Open files' }));

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(slot.contains(screen.getByTestId('mobile-environment'))).toBe(true);
  });

  it('uses an overlay on narrow desktop instead of compressing the conversation', () => {
    viewport.width = 900;

    render(
      <ChatLayout title='Conversation' conversation_id='conversation-1' sider={<div>Side content</div>}>
        <div>Timeline</div>
      </ChatLayout>
    );

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open files' }));

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'false');
  });

  it('keeps side-panel content mounted while the desktop panel closes and reopens', () => {
    let mounts = 0;
    let unmounts = 0;
    const StatefulSidePanel = () => {
      React.useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <div>Stateful side panel</div>;
    };

    render(
      <ChatLayout title='Conversation' conversation_id='conversation-1' sider={<StatefulSidePanel />}>
        <div>Timeline</div>
      </ChatLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open files' }));

    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it('opens Preview for later artifact, file, URL, or task requests without opening Files', () => {
    const { rerender } = render(previewTransitionView());

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByTestId('preview-panel')).toBeNull();

    preview.isOpen = true;
    preview.openRequestId = 1;
    rerender(previewTransitionView());
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();

    preview.openRequestId = 2;
    rerender(previewTransitionView());
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renders preview content as an independent canvas surface', () => {
    preview.isOpen = true;

    render(previewTransitionView());

    expect(screen.getByTestId('preview-panel')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
