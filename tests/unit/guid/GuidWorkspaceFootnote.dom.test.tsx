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
    ...overrides,
  };
}

describe('GuidWorkspaceFootnote', () => {
  it('disables project selection while workspace setup is incomplete', () => {
    render(
      <GuidWorkspaceFootnote {...createLaunchProps()} accessDisabled accessDisabledReason='complete workspace setup' />
    );

    expect(screen.getByTestId('guid-new-task-context-bar')).toHaveAttribute('data-access-disabled', 'true');
    const selector = screen.getByTestId('workspace-selector-btn');
    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toContainElement(selector);
    expect(selector).toBeDisabled();
  });

  it('describes projectless context without implying a file restriction', () => {
    render(<GuidWorkspaceFootnote {...createLaunchProps()} />);

    expect(screen.queryByTestId('opl-guid-workspace-access-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-projectless-context')).toHaveTextContent('guid.workspace.noProject');
  });

  it('keeps the new-task workspace selector as the only context control', () => {
    render(<GuidWorkspaceFootnote {...createLaunchProps({ workspaceDir: '/workspace/research' })} />);

    expect(screen.getByText('research')).toBeInTheDocument();
    const contextButtons = within(screen.getByTestId('guid-workspace-controls')).getAllByRole('button');
    expect(contextButtons.map((button) => button.textContent)).toEqual(['research']);
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
