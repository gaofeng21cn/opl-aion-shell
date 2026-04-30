/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ipcMock = vi.hoisted(() => ({
  getModelConfig: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    mode: {
      getModelConfig: { invoke: ipcMock.getModelConfig },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (key === 'conversation.welcome.codexDefaultConfigPrefix') return 'Codex Default: ';
      if (key === 'conversation.welcome.codexDefaultConfigFallback') return 'Codex Default';
      if (key === 'conversation.welcome.codexDefaultConfigTooltip') {
        return 'OPL uses the system Codex configuration for this conversation.';
      }
      return fallback || key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [], error: undefined, mutate: vi.fn() }),
}));

import GuidModelSelector from '../../src/renderer/pages/guid/components/GuidModelSelector';

describe('GuidModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.getModelConfig.mockResolvedValue([]);
  });

  it('shows the model source for read-only ACP model info', () => {
    render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn(async () => {})}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          currentModelId: 'claude-opus-4-6',
          currentModelLabel: 'Claude Opus 4.6',
          availableModels: [{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' }],
          canSwitch: false,
          source: 'models',
          sourceDetail: 'cc-switch',
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.getAllByText('Claude Opus 4.6 · cc-switch').length).toBeGreaterThan(0);
  });

  it('shows Codex system defaults as read-only instead of model choices', () => {
    render(
      <GuidModelSelector
        isCodexMode
        codexDefaultConfigLabel='gpt-5.5 · xhigh'
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn(async () => {})}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          currentModelId: 'gpt-5.3-codex',
          currentModelLabel: 'gpt-5.3-codex',
          availableModels: [
            { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
            { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
          ],
          canSwitch: true,
          source: 'models',
        }}
        selectedAcpModel={'gpt-5.3-codex'}
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.getByText('Codex Default: gpt-5.5 · xhigh')).toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();
  });

  it('shows the selected model and source when ACP switching is enabled', () => {
    render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn(async () => {})}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          currentModelId: 'claude-opus-4-6',
          currentModelLabel: 'Claude Opus 4.6',
          availableModels: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
          canSwitch: true,
          source: 'models',
          sourceDetail: 'acp-models',
        }}
        selectedAcpModel={'claude-sonnet-4-5'}
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.getAllByText('Claude Sonnet 4.5').length).toBeGreaterThan(0);
  });
});
