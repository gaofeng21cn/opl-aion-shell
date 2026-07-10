import type { TChatConversation } from '@/common/config/storage';
import ChatSlider from '@/renderer/pages/conversation/components/ChatSlider';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preview = vi.hoisted(() => ({
  activeTab: null as { content_type: string } | null,
  isOpen: false,
  openPreview: vi.fn(),
}));
const workspaceLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => true }));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  PreviewPanel: () => <div data-testid='preview-panel' />,
  usePreviewContext: () => preview,
}));

vi.mock('@/renderer/pages/conversation/Workspace', () => ({
  default: ({ activeTab }: { activeTab?: string }) => {
    React.useEffect(() => {
      workspaceLifecycle.mounts += 1;
      return () => {
        workspaceLifecycle.unmounts += 1;
      };
    }, []);
    return <div data-testid='workspace' data-active-tab={activeTab} />;
  },
}));

vi.mock('@/renderer/pages/conversation/runtime/CurrentTaskAwareness', () => ({
  default: () => <div data-testid='runtime-details' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton', () => ({
  default: () => <button type='button'>Open terminal</button>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.sidePanel.review': 'Review',
        'conversation.sidePanel.terminal': 'Terminal',
        'conversation.sidePanel.browser': 'Browser',
        'conversation.sidePanel.files': 'Files',
        'conversation.sidePanel.moreContext': 'More context',
        'conversation.sidePanel.artifacts': 'Artifacts',
        'conversation.sidePanel.runtime': 'Runtime',
        'conversation.sidePanel.actions': 'Actions',
        'conversation.sidePanel.memory': 'Memory',
        'conversation.sidePanel.browserAddress': 'Web address',
        'conversation.sidePanel.openBrowser': 'Open address',
        'conversation.sidePanel.browserEmpty': 'No page open',
        'conversation.sidePanel.artifactsEmpty': 'No artifact preview',
        'conversation.sidePanel.actionsEmpty': 'No available actions',
        'conversation.sidePanel.memoryEmpty': 'No memory projection',
        'conversation.sidePanel.unavailable': 'Unavailable',
      })[key] ?? key,
  }),
}));

const conversation = {
  id: 'conversation-1',
  name: 'Conversation',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: { workspace: '/projects/demo' },
} as TChatConversation;

describe('ChatSlider tool hierarchy', () => {
  beforeEach(() => {
    preview.activeTab = null;
    preview.isOpen = false;
    preview.openPreview.mockReset();
    workspaceLifecycle.mounts = 0;
    workspaceLifecycle.unmounts = 0;
  });

  it('keeps four primary tools and hides secondary context by default', () => {
    render(<ChatSlider conversation={conversation} />);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-active-tab', 'changes');
    expect(screen.queryByRole('button', { name: 'Artifacts' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More context' }));

    expect(screen.getByRole('button', { name: 'Artifacts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Runtime' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Memory' })).toBeTruthy();
  });

  it('switches the shared workspace between review and files', () => {
    render(<ChatSlider conversation={conversation} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-active-tab', 'files');
  });

  it('keeps the workspace mounted while switching through browser and terminal tools', () => {
    render(<ChatSlider conversation={conversation} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Browser' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(workspaceLifecycle.mounts).toBe(1);
    expect(workspaceLifecycle.unmounts).toBe(0);
  });

  it('opens validated web addresses through the existing preview context', () => {
    render(<ChatSlider conversation={conversation} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Browser' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Web address' }), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open address' }));

    expect(preview.openPreview).toHaveBeenCalledWith(
      'https://example.com/',
      'url',
      { title: 'https://example.com/' },
      { replace: true }
    );
  });

  it('shows artifact, provenance, and receipt refs without rendering preview body', () => {
    preview.isOpen = true;
    preview.activeTab = { content_type: 'markdown' };
    const currentTask = {
      artifact_or_blocker: { ref: 'artifact://draft', body: 'artifact body' },
      latest_receipt_ref: 'receipt://latest',
      provenance_bundle_refs: ['bundle://provenance'],
    } as never;

    render(<ChatSlider conversation={conversation} currentTask={currentTask} />);

    expect(screen.getByText('artifact://draft')).toBeTruthy();
    expect(screen.getByText('receipt://latest')).toBeTruthy();
    expect(screen.getByText('bundle://provenance')).toBeTruthy();
    expect(screen.queryByText('artifact body')).toBeNull();
    expect(screen.queryByTestId('preview-panel')).toBeNull();
  });
});
