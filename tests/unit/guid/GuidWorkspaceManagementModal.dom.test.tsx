import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidWorkspaceManagementModal from '@/renderer/pages/guid/components/GuidWorkspaceManagementModal';

const workspaceMocks = vi.hoisted(() => ({
  recent: [] as string[],
  removeRecentWorkspace: vi.fn((path: string) => {
    workspaceMocks.recent = workspaceMocks.recent.filter((entry) => entry !== path);
  }),
}));

vi.mock('@/renderer/components/workspace', () => ({
  getRecentWorkspaces: () => workspaceMocks.recent,
  removeRecentWorkspace: workspaceMocks.removeRecentWorkspace,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GuidWorkspaceManagementModal', () => {
  beforeEach(() => {
    workspaceMocks.recent = ['/workspace/research', '/workspace/inactive'];
    workspaceMocks.removeRecentWorkspace.mockClear();
  });

  it('lists registered directories and removes only the selected registration', () => {
    render(<GuidWorkspaceManagementModal visible onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'guid.workspace.registeredTitle' })).toBeInTheDocument();
    expect(screen.getByText('/workspace/research')).toBeInTheDocument();
    expect(screen.getByText('/workspace/inactive')).toBeInTheDocument();

    const inactiveRow = screen.getByText('/workspace/inactive').closest('div.flex');
    expect(inactiveRow).not.toBeNull();
    fireEvent.click(within(inactiveRow as HTMLElement).getByRole('button'));

    expect(workspaceMocks.removeRecentWorkspace).toHaveBeenCalledWith('/workspace/inactive');
    expect(screen.queryByText('/workspace/inactive')).not.toBeInTheDocument();
    expect(screen.getByText('/workspace/research')).toBeInTheDocument();
  });

  it('shows the registered-directory empty state without inventing a workspace', () => {
    workspaceMocks.recent = [];
    render(<GuidWorkspaceManagementModal visible onClose={vi.fn()} />);

    expect(screen.getByTestId('registered-workspace-list')).toHaveTextContent('guid.workspace.noRegistered');
    expect(screen.queryByRole('button', { name: /guid\.workspace\.removeRegistered/ })).not.toBeInTheDocument();
  });
});
