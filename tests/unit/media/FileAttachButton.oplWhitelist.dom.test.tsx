import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';

const mocks = vi.hoisted(() => ({
  emitterEmit: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: {
    processDroppedFiles: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: mocks.emitterEmit,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [] }),
}));

describe('FileAttachButton OPL ordinary whitelist', () => {
  it('opens the palette with explicit empty capability state instead of invoking the file picker', async () => {
    const user = userEvent.setup();
    const openFileSelector = vi.fn();
    const openDirectorySelector = vi.fn();
    render(
      <FileAttachButton
        openFileSelector={openFileSelector}
        openDirectorySelector={openDirectorySelector}
        loadedSkills={[]}
        loadedMcpStatuses={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'guid.context.addContext' }));

    expect(openFileSelector).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'guid.context.paletteTitle' });
    expect(screen.getByRole('heading', { name: 'guid.context.localInputsGroup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'guid.context.skillsGroup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'guid.context.appsAndConnectionsGroup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conversation.skills.manage/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conversation.mcp.manage/ })).toBeInTheDocument();
    await waitFor(() => expect(dialog.closest('.arco-trigger')).toHaveStyle({ pointerEvents: 'auto' }));

    await user.click(screen.getByRole('button', { name: /Add files/ }));
    expect(openFileSelector).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'guid.context.addContext' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'guid.context.paletteTitle' }).closest('.arco-trigger')).toHaveStyle({
        pointerEvents: 'auto',
      })
    );
    await user.click(await screen.findByRole('button', { name: /Add folder/ }));
    expect(openDirectorySelector).toHaveBeenCalledOnce();
  });

  it('invokes only loaded allowlisted Skills and keeps MCP snapshot entries read-only', async () => {
    const user = userEvent.setup();
    render(
      <FileAttachButton
        openFileSelector={vi.fn()}
        loadedSkills={['aionui-skills', 'cron', 'skill-creator', 'med-autoscience']}
        loadedMcpStatuses={[
          { id: 'unknown-mcp', name: 'Unknown MCP', status: 'loaded' },
          { id: 'aionui-image-generation', name: 'AionUI Image Generation', status: 'loaded' },
        ]}
      />
    );

    const moreButton = screen.getByRole('button', { name: 'guid.context.addContext' });
    moreButton.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'guid.context.paletteTitle' });
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('aionui-skills')).not.toBeInTheDocument();
    expect(screen.queryByText('cron')).not.toBeInTheDocument();
    expect(screen.queryByText('skill-creator')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown MCP')).not.toBeInTheDocument();
    expect(screen.queryByText('AionUI Image Generation')).not.toBeInTheDocument();

    await waitFor(() => expect(dialog.closest('.arco-trigger')).toHaveStyle({ pointerEvents: 'auto' }));
    await user.click(screen.getByRole('button', { name: 'med-autoscience' }));
    expect(mocks.emitterEmit).toHaveBeenCalledWith('sendbox.fill', '/med-autoscience ');
  });
});

describe('DirectorySelectionModal keyboard paths', () => {
  const installDirectoryFetch = () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const isNestedDirectory = String(input).includes('path=%2Ffolder-a');
      const data = isNestedDirectory
        ? {
            items: [{ name: 'Nested folder', path: '/folder-a/nested', isDirectory: true }],
            canGoUp: true,
            parentPath: '/',
          }
        : {
            items: [{ name: 'Folder A', path: '/folder-a', isDirectory: true }],
            canGoUp: false,
          };
      return {
        ok: true,
        json: async () => ({ data }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enters a directory with Enter and focuses the first action in the loaded directory', async () => {
    const fetchMock = installDirectoryFetch();
    const user = userEvent.setup();
    render(<DirectorySelectionModal visible onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const directoryButton = await screen.findByRole('button', { name: 'Folder A' });
    directoryButton.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const parentButton = await screen.findByRole('button', { name: '..' });
    await waitFor(() => expect(parentButton).toHaveFocus());
  });

  it('selects a directory with Space and confirms the selected path', async () => {
    installDirectoryFetch();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DirectorySelectionModal visible onConfirm={onConfirm} onCancel={vi.fn()} />);

    const selectButton = await screen.findByRole('button', { name: 'common.select Folder A' });
    selectButton.focus();
    await user.keyboard(' ');

    const confirmButton = screen.getByRole('button', { name: 'common.confirm' });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith(['/folder-a']);
  });
});
