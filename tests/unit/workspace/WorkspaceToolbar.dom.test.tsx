import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceToolbar from '@/renderer/pages/conversation/Workspace/components/WorkspaceToolbar';

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  default: () => null,
}));

describe('WorkspaceToolbar WebUI upload', () => {
  it('opens browser upload directly from the add button', () => {
    const handleUploadDeviceFiles = vi.fn();
    const { container } = render(
      <WorkspaceToolbar
        t={((key: string) => key) as never}
        isWorkspaceCollapsed={false}
        setIsWorkspaceCollapsed={vi.fn()}
        workspaceDisplayName='projects'
        showSearch={false}
        searchText=''
        setSearchText={vi.fn()}
        onSearch={vi.fn()}
        searchInputRef={{ current: null }}
        loading={false}
        refreshWorkspace={vi.fn()}
        handleUploadDeviceFiles={handleUploadDeviceFiles}
      />
    );

    const addButton = container.querySelector('.workspace-toolbar-actions .workspace-toolbar-icon-btn');
    expect(addButton).not.toBeNull();
    fireEvent.click(addButton!);
    expect(handleUploadDeviceFiles).toHaveBeenCalledTimes(1);
  });
});
