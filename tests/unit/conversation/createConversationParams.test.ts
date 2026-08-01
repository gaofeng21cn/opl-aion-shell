import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { buildCliAgentParams } from '@/renderer/pages/conversation/utils/createConversationParams';

const { configGetMock, getManagedAgentsMock, loadOplAppStateMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  getManagedAgentsMock: vi.fn(),
  loadOplAppStateMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
  },
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  getManagedAgents: getManagedAgentsMock,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  loadOplAppStateFromBridge: loadOplAppStateMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: vi.fn() },
    },
  },
}));

const codexAgent = {
  id: 'codex',
  agent_type: 'acp',
  backend: 'codex',
  name: 'Codex',
} as AgentMetadata;

describe('createConversationParams Codex model preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOplAppStateMock.mockResolvedValue({ app_state: {} });
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.6-codex' } };
      }
      return undefined;
    });
    getManagedAgentsMock.mockResolvedValue([
      {
        ...codexAgent,
        handshake: {
          available_models: {
            current_model_id: 'gpt-5.4',
            current_model_label: 'GPT-5.4',
            available_models: [
              { id: 'gpt-5.5', label: 'GPT-5.5' },
              { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
            ],
          },
        },
      },
    ]);
  });

  it('preserves a stale fixed Codex model without injecting generated session context', async () => {
    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.current_model_id).toBe('gpt-5.6-codex');
    expect(params.extra.preset_context).toBeUndefined();
  });

  it('keeps an available allowlisted Codex preferred model', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.5' } };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.current_model_id).toBe('gpt-5.5');
  });

  it('keeps an explicit fixed selection ahead of the installed OPL Flow recommendation', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.5' } };
      }
      return undefined;
    });
    loadOplAppStateMock.mockResolvedValue({
      app_state: {
        agent_packages: {
          status_index: {
            packages: {
              'opl-flow': {
                presence: { installed: true },
                model_projection: {
                  surface_kind: 'opl_codex_model_policy_projection.v1',
                  authority: 'opl-flow',
                  mode_default: 'auto',
                  role: 'package_recommendation_consumed_from_framework_projection',
                  configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
                  override_precedence: [
                    'explicit_user_override',
                    'opl_flow_recommendation',
                    'fresh_codex_model_catalog',
                    'app_fallback_when_flow_unavailable',
                  ],
                  catalog_policy: { source: 'codex_cli_model_list' },
                },
              },
            },
          },
        },
      },
    });

    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.current_model_id).toBe('gpt-5.5');
    expect(params.extra.pending_config_options).toEqual({ reasoning_effort: 'max' });
  });

  it('keeps assistant and management identities separate for generated candidates', async () => {
    const params = await buildCliAgentParams(
      {
        ...codexAgent,
        id: 'assistant-codex',
        assistant_id: 'assistant-codex',
        managed_agent_id: 'runtime-codex',
      } as AgentMetadata,
      '/tmp/opl-workspace',
      'en-US'
    );

    expect(params.assistant).toEqual({ id: 'assistant-codex', locale: 'en-US' });
    expect(params.extra.agent_id).toBe('runtime-codex');
  });

  it('injects OPL Flow metadata only from canonical fresh installed presence', async () => {
    loadOplAppStateMock.mockResolvedValue({
      app_state: {
        agent_packages: {
          status_index: {
            packages: {
              'opl-flow': {
                presence: { installed: true },
                package_operational: { status: 'unavailable' },
              },
            },
          },
        },
      },
    });

    const installed = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');
    expect(installed.extra.opl_flow_context).toEqual({
      flow_id: 'opl-flow',
      source: 'framework-agent-package-projection',
      delivery: 'installed_package_metadata_only',
      language: 'follow_ui_locale_zh_only_when_ui_zh',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    });

    loadOplAppStateMock.mockResolvedValue({
      app_state: {
        agent_packages: {
          directory: { entries: [{ package_id: 'opl-flow', installed: true }] },
          status_index: {
            packages: {
              'opl-flow': { operational_ready: true, presence: { present: true } },
            },
          },
        },
      },
    });
    const nonCanonical = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');
    expect(nonCanonical.extra.opl_flow_context).toBeUndefined();
  });

  it('fails closed when fresh App state cannot be read', async () => {
    loadOplAppStateMock.mockRejectedValue(new Error('state unavailable'));

    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.opl_flow_context).toBeUndefined();
  });
});
