import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuidWorkspaceFootnote from '@/renderer/pages/guid/components/GuidWorkspaceFootnote';

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/components/workspace', () => ({
  addRecentWorkspace: vi.fn(),
  getRecentWorkspaces: () => [],
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
});
