import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    gitWorkspace: {
      inspect: { invoke: vi.fn().mockResolvedValue({ currentBranch: 'codex/context' }) },
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

function createLaunchProps(
  overrides: Partial<React.ComponentProps<typeof GuidWorkspaceFootnote>> = {}
): React.ComponentProps<typeof GuidWorkspaceFootnote> {
  return {
    workspaceDir: '',
    onSelectWorkspace: vi.fn(),
    onClearWorkspace: vi.fn(),
    launchMode: 'local',
    onLaunchModeChange: vi.fn(),
    branchOptions: [],
    selectedStartRef: '',
    onSelectedStartRefChange: vi.fn(),
    ...overrides,
  };
}

describe('GuidWorkspaceFootnote', () => {
  it('disables project and Worktree controls while workspace setup is incomplete', () => {
    render(
      <GuidWorkspaceFootnote
        {...createLaunchProps()}
        accessDisabled
        accessDisabledReason='complete workspace setup'
        worktreeControlsDisabled
      />
    );

    expect(screen.getByTestId('guid-new-task-context-bar')).toHaveAttribute('data-access-disabled', 'true');
    const selector = screen.getByTestId('workspace-selector-btn');
    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toContainElement(selector);
    expect(selector).toBeDisabled();
    expect(screen.getByTestId('guid-launch-mode-trigger')).toBeDisabled();
  });

  it('describes projectless context without implying a file restriction', () => {
    render(<GuidWorkspaceFootnote {...createLaunchProps()} />);

    expect(screen.queryByTestId('opl-guid-workspace-access-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-projectless-context')).toHaveTextContent('guid.workspace.noProject');
  });

  it('renders compact location and branch menus with an inline Worktree failure', async () => {
    const onLaunchModeChange = vi.fn();
    const onSelectedStartRefChange = vi.fn();
    render(
      <GuidWorkspaceFootnote
        {...createLaunchProps({
          workspaceDir: '/workspace/research',
          launchMode: 'worktree',
          onLaunchModeChange,
          branchOptions: [
            { value: 'refs/heads/main', label: 'main', current: true },
            { value: 'refs/heads/feature/research', label: 'feature/research', current: false },
          ],
          selectedStartRef: 'refs/heads/main',
          onSelectedStartRefChange,
          worktreeError: 'worktree failed',
        })}
      />
    );

    expect(screen.getByTestId('guid-new-task-context-bar')).toBeInTheDocument();
    expect(screen.getByTestId('guid-starting-branch-selector')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('worktree failed');
    await screen.findByTestId('guid-branch-context');

    await userEvent.click(screen.getByTestId('guid-launch-mode-trigger'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'guid.home.localContext' }));
    expect(onLaunchModeChange).toHaveBeenCalledWith('local');
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'guid.home.localContext' })).not.toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId('guid-starting-branch-selector'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/research' }));
    expect(onSelectedStartRefChange).toHaveBeenCalledWith('refs/heads/feature/research');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'feature/research' })).not.toBeInTheDocument());
  });

  it('orders working directory, location, and branch without a duplicate capability label', async () => {
    render(<GuidWorkspaceFootnote {...createLaunchProps({ workspaceDir: '/workspace/research' })} />);

    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByTestId('guid-local-context')).toBeInTheDocument();
    expect(await screen.findByTestId('guid-branch-context')).toHaveTextContent('codex/context');
    const contextButtons = within(screen.getByTestId('guid-task-location-controls')).getAllByRole('button');
    expect(contextButtons.map((button) => button.textContent)).toEqual([
      'research',
      'guid.home.localContext',
      'codex/context',
    ]);
    expect(screen.queryByTestId('guid-active-capability')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guid-project-context-ref')).not.toBeInTheDocument();
  });

  it('keeps inactive registered directories out of the selector and removes them from management', () => {
    const onClearWorkspace = vi.fn();
    render(
      <GuidWorkspaceFootnote
        {...createLaunchProps({ workspaceDir: '/workspace/research' })}
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
