import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuidWorkspaceFootnote from '@/renderer/pages/guid/components/GuidWorkspaceFootnote';

const workspaceMocks = vi.hoisted(() => ({
  recent: ['/workspace/research', '/workspace/inactive'],
  removeRecentWorkspace: vi.fn((path: string) => {
    workspaceMocks.recent = workspaceMocks.recent.filter((entry) => entry !== path);
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
    fileSnapshot: {
      getInfo: { invoke: vi.fn().mockResolvedValue({ mode: 'git-repo', branch: 'codex/context' }) },
    },
  },
}));

vi.mock('@/renderer/components/workspace', () => ({
  addRecentWorkspace: vi.fn(),
  getRecentWorkspaces: () => workspaceMocks.recent,
  removeRecentWorkspace: workspaceMocks.removeRecentWorkspace,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GuidWorkspaceFootnote', () => {
  it('exposes a disabled project selector while workspace setup is incomplete', () => {
    render(
      <GuidWorkspaceFootnote
        workspaceDir=''
        onSelectWorkspace={vi.fn()}
        onClearWorkspace={vi.fn()}
        accessDisabled
        accessDisabledReason='complete workspace setup'
      />
    );

    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-selector-btn')).toBeDisabled();
  });

  it('shows Home project, local, branch, capability, and removable project refs in the top strip', async () => {
    const onRemove = vi.fn();
    render(
      <GuidWorkspaceFootnote
        workspaceDir='/workspace/research'
        onSelectWorkspace={vi.fn()}
        onClearWorkspace={vi.fn()}
        activeCapabilityLabel='Research'
        projectContextRefs={[
          {
            path: '/workspace/research/docs/protocol.md',
            name: 'protocol.md',
            relativePath: 'docs/protocol.md',
            isFile: true,
          },
        ]}
        onRemoveProjectContextRef={onRemove}
      />
    );

    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByTestId('guid-local-context')).toBeInTheDocument();
    expect(await screen.findByTestId('guid-branch-context')).toHaveTextContent('codex/context');
    expect(screen.getByTestId('guid-active-capability')).toHaveTextContent('guid.home.activeCapability');
    expect(screen.getByTestId('guid-project-context-ref')).toHaveTextContent('docs/protocol.md');

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.projectContext.remove' }));
    expect(onRemove).toHaveBeenCalledWith('/workspace/research/docs/protocol.md');
  });

  it('keeps inactive registered directories out of the selector and removes them from management', () => {
    const onClearWorkspace = vi.fn();
    render(
      <GuidWorkspaceFootnote
        workspaceDir='/workspace/research'
        onSelectWorkspace={vi.fn()}
        onClearWorkspace={onClearWorkspace}
      />
    );

    fireEvent.click(screen.getByText('research'));
    expect(screen.queryByText('inactive')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'guid.workspace.manageRegistered' }));
    expect(screen.getByRole('dialog', { name: 'guid.workspace.registeredTitle' })).toBeInTheDocument();
    expect(screen.getByText('/workspace/inactive')).toBeInTheDocument();

    const inactiveRow = screen.getByText('/workspace/inactive').closest('div.flex');
    expect(inactiveRow).not.toBeNull();
    fireEvent.click(within(inactiveRow as HTMLElement).getByRole('button'));
    expect(workspaceMocks.removeRecentWorkspace).toHaveBeenCalledWith('/workspace/inactive');
    expect(onClearWorkspace).not.toHaveBeenCalled();
  });
});
