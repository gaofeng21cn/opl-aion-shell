/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChannelDefaultModel } from '@process/channels/actions/SystemActions';
import { buildChannelConversationExtra, getChannelEnabledSkills } from '@process/channels/utils';

const { mockGet, mockGetDetectedAgents } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetDetectedAgents: vi.fn(() => []),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: mockGet },
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({})),
}));

vi.mock('@process/acp/connectors/acpConversationConnector', () => ({}));

vi.mock('@process/model/providerListStore', () => ({
  getProviderList: vi.fn(async () => []),
}));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    getDetectedAgents: mockGetDetectedAgents,
  },
}));

vi.mock('@/process/services/conversationServiceSingleton', () => ({
  conversationServiceSingleton: {
    createConversation: vi.fn(),
  },
}));

vi.mock('@/process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    kill: vi.fn(),
  },
}));

vi.mock('@process/channels/agent/ChannelMessageService', () => ({
  getChannelMessageService: vi.fn(() => ({
    clearContext: vi.fn(),
  })),
}));

vi.mock('@process/channels/core/ChannelManager', () => ({
  getChannelManager: vi.fn(() => ({
    getSessionManager: vi.fn(),
    isInitialized: vi.fn(() => false),
  })),
}));

vi.mock('@process/channels/plugins/telegram/TelegramKeyboards', () => ({
  createAgentSelectionKeyboard: vi.fn(),
  createHelpKeyboard: vi.fn(),
  createMainMenuKeyboard: vi.fn(),
  createSessionControlKeyboard: vi.fn(),
}));

vi.mock('@process/channels/plugins/lark/LarkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

vi.mock('@process/channels/plugins/dingtalk/DingTalkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

describe('SystemActions weixin platform handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
    mockGetDetectedAgents.mockReturnValue([]);
  });

  it('uses Codex schema model for channel conversations', async () => {
    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe('codex_system');
    expect(result.platform).toBe('codex');
    expect(result.useModel).toBe('gpt-5.5');
    expect(mockGet).not.toHaveBeenCalledWith('model.config');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.weixin.defaultModel');
  });

  it('enables weixin-file-send only for weixin channel conversations', () => {
    expect(getChannelEnabledSkills('weixin')).toEqual(['weixin-file-send']);
    expect(getChannelEnabledSkills('telegram')).toBeUndefined();
  });

  it('builds channel conversation extra with enabledSkills for weixin across backends', () => {
    expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'gemini' })).toEqual({
      enabledSkills: ['weixin-file-send'],
    });

    expect(
      buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
        customAgentId: 'agent-1',
        agentName: 'Claude',
      })
    ).toEqual({
      backend: 'claude',
      customAgentId: 'agent-1',
      agentName: 'Claude',
      enabledSkills: ['weixin-file-send'],
    });
  });
});
