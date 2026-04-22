import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAcpAdapters, mockProcessConfigGet } = vi.hoisted(() => ({
  mockGetAcpAdapters: vi.fn(),
  mockProcessConfigGet: vi.fn(async () => null),
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
    },
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({ updateConversation: vi.fn() })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockProcessConfigGet,
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: mockGetAcpAdapters,
    }),
  },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn(() => true),
  setupAssistantWorkspace: vi.fn(),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (c: string) => ({ content: c, loadedSkills: [] })),
  buildSystemInstructions: vi.fn(async () => undefined),
}));

vi.mock('@process/agent/acp', () => ({
  AcpAgent: vi.fn(),
}));

vi.mock('@process/acp/compat', () => ({
  AcpAgentV2: vi.fn(function () {
    this.sendMessage = vi.fn(async () => ({ success: true }));
    this.getModelInfo = vi.fn(() => null);
    this.getSessionState = vi.fn(() => null);
    this.start = vi.fn(async () => {});
    this.stop = vi.fn();
    this.kill = vi.fn();
    this.on = vi.fn().mockReturnThis();
  }),
}));

import AcpAgentManager from '@process/task/AcpAgentManager';

function createManager(overrides: Record<string, unknown> = {}) {
  return new AcpAgentManager({
    conversation_id: 'conv-1',
    backend: 'claude',
    workspace: '/tmp/workspace',
    ...overrides,
  } as never);
}

describe('AcpAgentManager extension launch config fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessConfigGet.mockResolvedValue(null);
    mockGetAcpAdapters.mockReturnValue([]);
  });

  it('resolves extension launch config from backend id when legacy conversation is missing customAgentId', async () => {
    mockGetAcpAdapters.mockReturnValue([
      {
        id: 'opl-acp',
        name: 'OPL ACP',
        defaultCliPath: '/opt/homebrew/bin/node',
        acpArgs: ['--experimental-strip-types', '/tmp/opl-cli.ts', 'session', 'runtime', '--acp'],
        env: {
          OPL_CODEX_BIN: '/tmp/fake-codex',
        },
        _extensionName: 'opl-acp-extension',
      },
    ]);

    const manager = createManager({
      backend: 'opl-acp',
      cliPath: '/usr/bin/node',
    });

    const resolved = await (manager as unknown as {
      resolveAgentCliConfig: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).resolveAgentCliConfig({
      conversation_id: 'conv-1',
      backend: 'opl-acp',
      cliPath: '/usr/bin/node',
      workspace: '/tmp/workspace',
    });

    expect(resolved).toEqual({
      cliPath: '/opt/homebrew/bin/node',
      customArgs: ['--experimental-strip-types', '/tmp/opl-cli.ts', 'session', 'runtime', '--acp'],
      customEnv: {
        OPL_CODEX_BIN: '/tmp/fake-codex',
      },
    });
  });
});
