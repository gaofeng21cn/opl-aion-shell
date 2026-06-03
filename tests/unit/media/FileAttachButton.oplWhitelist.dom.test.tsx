import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';

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
    emit: vi.fn(),
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
  it('does not expose AionUI skills or unknown MCP statuses as loaded session items', () => {
    const openFileSelector = vi.fn();
    render(
      <FileAttachButton
        openFileSelector={openFileSelector}
        loadedSkills={['aionui-skills', 'cron', 'skill-creator']}
        loadedMcpStatuses={[
          { id: 'unknown-mcp', name: 'Unknown MCP', status: 'loaded' },
          { id: 'aionui-image-generation', name: 'AionUI Image Generation', status: 'loaded' },
        ]}
      />
    );

    expect(screen.getByTestId('aionrs-attach-folder-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('aionrs-file-upload-input')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded MCP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded Skills/)).not.toBeInTheDocument();
  });
});
