/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPL_APP_ACTIVATION_POLICY,
  OPL_CODEX_CONTEXT_SNIPPET,
  OPL_DEFAULT_CODEX_SKILLS,
} from '../../src/common/config/oplSkills';
import { resolveLocaleKey } from '../../src/common/utils';

const loadPresetAssistantResources = vi.fn();
const configGet = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {},
}));

vi.mock('@/common/config/storage', async () => {
  const actual = await vi.importActual<typeof import('../../src/common/config/storage')>(
    '../../src/common/config/storage'
  );
  return {
    ...actual,
    ConfigStorage: {
      get: configGet,
    },
  };
});

vi.mock('@/common/utils/presetAssistantResources', () => ({
  loadPresetAssistantResources,
}));

const { buildPresetAssistantParams, buildCliAgentParams } =
  await import('../../src/renderer/pages/conversation/utils/createConversationParams');

describe('createConversationParams', () => {
  beforeEach(() => {
    loadPresetAssistantResources.mockReset();
    configGet.mockReset();
  });

  it('uses the shared locale resolver for Turkish', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'preset rules',
      skills: '',
      enabledSkills: ['moltbook'],
    });
    configGet.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        model: ['gpt-4.1'],
        enabled: true,
      },
    ]);

    const params = await buildPresetAssistantParams(
      {
        backend: 'gemini',
        name: 'Preset Assistant',
        customAgentId: 'builtin-cowork',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'tr'
    );

    expect(resolveLocaleKey('tr')).toBe('tr-TR');
    expect(loadPresetAssistantResources).toHaveBeenCalledWith({
      customAgentId: 'builtin-cowork',
      localeKey: 'tr-TR',
    });
    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('codex');
    expect(params.extra.presetContext).toBe(`${OPL_CODEX_CONTEXT_SNIPPET}\n\npreset rules`);
    expect(params.extra.presetContext).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(params.extra.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS, 'moltbook']);
    expect(params.model).toEqual({});
  });

  it('passes the OPL App Codex session addendum into preset assistant context', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'preset rules',
      skills: '',
      enabledSkills: [],
    });
    configGet.mockResolvedValue([]);

    const params = await buildPresetAssistantParams(
      {
        backend: 'gemini',
        name: 'Preset Assistant',
        customAgentId: 'builtin-cowork',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'en',
      { oplCodexSessionAddendum: 'Session-only rule' }
    );

    expect(params.extra.presetContext).toBe(
      `${OPL_CODEX_CONTEXT_SNIPPET}\n\n## OPL App Session Addendum\n\nSession-only rule\n\npreset rules`
    );
  });

  it('loads the OPL App Codex session addendum for preset assistants when callers use the legacy signature', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'preset rules',
      skills: '',
      enabledSkills: [],
    });
    configGet.mockImplementation(async (key: string) => {
      if (key === 'opl.codexSessionAddendum') return 'Saved session addendum';
      return undefined;
    });

    const params = await buildPresetAssistantParams(
      {
        backend: 'gemini',
        name: 'Preset Assistant',
        customAgentId: 'builtin-cowork',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'en'
    );

    expect(configGet).toHaveBeenCalledWith('opl.codexSessionAddendum');
    expect(params.extra.presetContext).toContain('Saved session addendum');
  });

  it('maps acp preset assistants to presetContext and backend', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'acp preset rules',
      skills: '',
      enabledSkills: undefined,
    });

    const params = await buildPresetAssistantParams(
      {
        backend: 'codebuddy',
        name: 'Codebuddy Assistant',
        customAgentId: 'preset-1',
        isPreset: true,
        presetAgentType: 'codebuddy',
      },
      '/tmp/workspace',
      'zh'
    );

    expect(params.type).toBe('acp');
    expect(params.extra.presetContext).toBe('acp preset rules');
    expect(params.extra.backend).toBe('codebuddy');
  });

  it('maps legacy gemini preset assistants to Codex ACP without requiring a model provider', async () => {
    loadPresetAssistantResources.mockResolvedValue({
      rules: 'gemini preset rules',
      skills: '',
      enabledSkills: [],
    });
    configGet.mockResolvedValue([]); // No providers

    const params = await buildPresetAssistantParams(
      {
        backend: 'gemini',
        name: 'Gemini Assistant',
        customAgentId: 'builtin-gemini',
        isPreset: true,
        presetAgentType: 'gemini',
      },
      '/tmp/workspace',
      'en'
    );

    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
    expect(params.extra.presetContext).toBe(`${OPL_CODEX_CONTEXT_SNIPPET}\n\ngemini preset rules`);
    expect(params.extra.presetContext).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(params.extra.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS]);
  });

  it('maps legacy gemini CLI agents to Codex ACP without requiring a model provider', async () => {
    configGet.mockResolvedValue([]); // No providers

    const params = await buildCliAgentParams(
      {
        backend: 'gemini',
        name: 'Gemini CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
    expect(params.extra.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS]);
  });

  it('maps legacy aionrs CLI agents to Codex ACP without requiring a model provider', async () => {
    configGet.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'Provider',
        baseUrl: 'https://example.com',
        apiKey: 'token',
        model: ['gpt-4.1'],
        enabled: true,
      },
    ]);

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
    expect(params.extra.agentName).toBe('Aion CLI Agent');
  });

  it('does not require a configured provider for legacy aionrs agents', async () => {
    configGet.mockResolvedValue([]);

    const params = await buildCliAgentParams(
      {
        backend: 'aionrs',
        name: 'Aion CLI Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('codex');
  });

  it('sets empty model for ACP backend in buildCliAgentParams', async () => {
    const params = await buildCliAgentParams(
      {
        backend: 'claude',
        name: 'Claude Agent',
      },
      '/tmp/workspace'
    );

    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
  });

  it('reuses the saved ACP mode but leaves Codex model selection to system config', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          codex: {
            preferredMode: 'yolo',
            preferredModelId: 'gpt-5-codex',
          },
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.sessionMode).toBe('yolo');
    expect(params.extra.currentModelId).toBeUndefined();
  });

  it('loads the OPL App Codex session addendum for Codex CLI agents when callers use the legacy signature', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'opl.codexSessionAddendum') return 'Saved CLI addendum';
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(configGet).toHaveBeenCalledWith('opl.codexSessionAddendum');
    expect(params.extra.presetContext).toContain('Saved CLI addendum');
  });

  it('does not load the OPL App Codex session addendum for non-Codex ACP agents', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'opl.codexSessionAddendum') return 'Should not load';
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'claude',
        name: 'Claude Agent',
      },
      '/tmp/workspace'
    );

    expect(configGet).not.toHaveBeenCalledWith('opl.codexSessionAddendum');
    expect(JSON.stringify(params.extra)).not.toContain('Should not load');
  });

  it('falls back to legacy yolo mode when preferred ACP mode is missing', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            yoloMode: true,
          },
        };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'claude',
        name: 'Claude Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.sessionMode).toBe('bypassPermissions');
  });

  it('reuses the effective preset backend mode and model for ACP preset assistants', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabledSkills: [] });
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            preferredMode: 'acceptEdits',
            preferredModelId: 'claude-sonnet-4-5',
          },
        };
      }
      return undefined;
    });

    const params = await buildPresetAssistantParams(
      { backend: 'custom', name: 'A', customAgentId: 'p', isPreset: true, presetAgentType: 'claude' },
      '/tmp',
      'en'
    );

    expect(params.extra.backend).toBe('claude');
    expect(params.extra.sessionMode).toBe('acceptEdits');
    expect(params.extra.currentModelId).toBe('claude-sonnet-4-5');
  });

  it('does not inject a fallback Codex model when no cached ACP model exists', async () => {
    configGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {};
      }
      if (key === 'acp.cachedModels') {
        return {};
      }
      return undefined;
    });

    const params = await buildCliAgentParams(
      {
        backend: 'codex',
        name: 'Codex Agent',
      },
      '/tmp/workspace'
    );

    expect(params.extra.currentModelId).toBeUndefined();
  });

  it('ignores disabled model providers for legacy aionrs agents', async () => {
    configGet.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
    const params = await buildCliAgentParams({ backend: 'aionrs', name: 'Agent' }, '/tmp');
    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
  });

  it('ignores disabled model providers for legacy gemini agents', async () => {
    configGet.mockResolvedValue([{ id: 'p1', enabled: false, model: ['m1'] }]);
    const params = await buildCliAgentParams({ backend: 'gemini', name: 'Agent' }, '/tmp');
    expect(params.type).toBe('acp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
  });

  it('maps various backends correctly', async () => {
    const backends = [
      { input: 'openclaw', expected: 'openclaw-gateway' },
      { input: 'nanobot', expected: 'nanobot' },
      { input: 'remote', expected: 'remote' },
      { input: 'custom', expected: 'acp' },
    ];

    for (const { input, expected } of backends) {
      const params = await buildCliAgentParams({ backend: input, name: 'Agent' }, '/tmp');
      expect(params.type).toBe(expected);
    }
  });

  it('does not select model providers for legacy aionrs agents', async () => {
    configGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'P1',
        baseUrl: 'b1',
        apiKey: 'k1',
        model: ['m1', 'm2'],
        enabled: true,
        modelEnabled: { m1: false, m2: false },
      },
    ]);

    const params = await buildCliAgentParams({ backend: 'aionrs', name: 'A' }, '/tmp');
    expect(params.model).toEqual({});
    expect(params.extra.backend).toBe('codex');
  });

  it('handles missing cliPath for acp backend', async () => {
    const params = await buildCliAgentParams({ backend: 'claude', name: 'A' }, '/tmp');
    expect(params.extra.cliPath).toBeUndefined();
  });

  it('sets backend for acp preset assistant', async () => {
    loadPresetAssistantResources.mockResolvedValue({ rules: 'r', skills: '', enabledSkills: [] });
    const params = await buildPresetAssistantParams(
      { backend: 'claude', name: 'A', customAgentId: 'p', isPreset: true, presetAgentType: 'claude' },
      '/tmp',
      'en'
    );
    expect(params.extra.backend).toBe('claude');
  });
});
