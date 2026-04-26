import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock the AcpDetector that AgentRegistry delegates to
const mockDetectBuiltinAgents = vi.fn(async () => []);
const mockDetectExtensionAgents = vi.fn(async () => []);
const mockDetectCustomAgents = vi.fn(async () => []);
const mockClearEnvCache = vi.fn();
const mockIsCliAvailable = vi.fn(() => false);
const mockGetRemoteAgents = vi.fn(() => []);

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    detectBuiltinAgents: (...args: unknown[]) => mockDetectBuiltinAgents(...args),
    detectExtensionAgents: (...args: unknown[]) => mockDetectExtensionAgents(...args),
    detectCustomAgents: (...args: unknown[]) => mockDetectCustomAgents(...args),
    clearEnvCache: (...args: unknown[]) => mockClearEnvCache(...args),
    isCliAvailable: (...args: unknown[]) => mockIsCliAvailable(...args),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    getRemoteAgents: (...args: unknown[]) => mockGetRemoteAgents(...args),
  }),
}));

import type { AcpDetectedAgent } from '../../src/common/types/detectedAgent';

// Helper: create a mock ACP detected agent
function makeAcpAgent(opts: {
  id: string;
  name: string;
  backend: string;
  cliPath?: string;
  acpArgs?: string[];
  isExtension?: boolean;
  extensionName?: string;
}): AcpDetectedAgent {
  return {
    id: opts.id,
    name: opts.name,
    kind: 'acp',
    available: true,
    backend: opts.backend,
    cliPath: opts.cliPath ?? opts.id,
    acpArgs: opts.acpArgs ?? ['--acp'],
    isExtension: opts.isExtension,
    extensionName: opts.extensionName,
  };
}

async function createFreshRegistry() {
  vi.resetModules();
  const mod = await import('@process/agent/AgentRegistry');
  return mod.agentRegistry;
}

describe('AgentRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectBuiltinAgents.mockResolvedValue([]);
    mockDetectExtensionAgents.mockResolvedValue([]);
    mockDetectCustomAgents.mockResolvedValue([]);
    mockIsCliAvailable.mockReturnValue(false);
    mockGetRemoteAgents.mockReturnValue([]);
  });

  describe('initialize', () => {
    it('should detect built-in CLIs that are available on PATH', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'claude',
          name: 'Claude Code',
          backend: 'claude',
          cliPath: 'claude',
          acpArgs: ['--experimental-acp'],
        }),
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0]).toMatchObject({ backend: 'claude', cliPath: 'claude' });
      expect(agents[1]).toMatchObject({ backend: 'qwen', cliPath: 'qwen' });
      expect(mockDetectExtensionAgents).not.toHaveBeenCalled();
    });

    it('should skip built-in CLIs that are not available', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(1);
      expect(agents.find((a) => a.backend === 'qwen')).toBeUndefined();
      expect(agents.find((a) => a.backend === 'auggie')).toBeUndefined();
    });

    it('should not add legacy Aionrs or Gemini agents when no Codex ACP backend is detected', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(0);
      expect(agents.find((a) => a.backend === 'aionrs')).toBeUndefined();
      expect(agents.find((a) => a.backend === 'gemini')).toBeUndefined();
    });

    it('should not run twice (isDetected guard)', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      await registry.initialize(); // second call — should be no-op

      // detectBuiltinAgents called only during first init
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
      expect(mockDetectExtensionAgents).not.toHaveBeenCalled();

      await registry.initialize(); // third call — still no-op
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
    });
  });

  describe('deduplicate', () => {
    it('should deduplicate by backend — builtin wins over extension with same backend', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
        makeAcpAgent({
          id: 'qwen-duplicate',
          name: 'Qwen Duplicate',
          backend: 'qwen',
          cliPath: '/opt/qwen',
        }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      const qwenAgents = agents.filter((a) => a.backend === 'qwen');
      expect(qwenAgents).toHaveLength(1);
      expect(qwenAgents[0].cliPath).toBe('qwen'); // first detected backend wins
      expect(qwenAgents[0].isExtension).toBeUndefined();
    });

    it('should return no agents for empty detector results', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(0);
    });
  });

  describe('refreshExtensionAgents', () => {
    it('should ignore AionUI extension-contributed ACP agents', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();

      expect(registry.getDetectedAgents().find((a) => a.isExtension)).toBeUndefined();

      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'new',
          name: 'New Ext',
          backend: 'custom',
          cliPath: 'new-ext-cli',
          isExtension: true,
          extensionName: 'ext-new',
        }),
      ]);

      await registry.refreshExtensionAgents();
      const agents = registry.getDetectedAgents();

      const extAgent = agents.find((a) => a.kind === 'acp' && a.cliPath === 'new-ext-cli');
      expect(extAgent).toBeUndefined();
      expect(mockDetectExtensionAgents).not.toHaveBeenCalled();
      expect(agents.map((agent) => agent.backend)).toEqual(['claude']);
    });
  });

  describe('refreshBuiltinAgents', () => {
    it('should refresh builtin ACP agents without adding legacy Aionrs or Gemini agents', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();

      await registry.refreshBuiltinAgents();
      const agents = registry.getDetectedAgents();

      expect(agents.map((agent) => agent.backend)).toEqual(['claude', 'qwen']);
    });

    it('should clear env cache before re-detecting', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();

      await registry.refreshBuiltinAgents();
      expect(mockClearEnvCache).toHaveBeenCalled();
    });
  });

  describe('hasAgents', () => {
    it('should return true after initialization when a Codex ACP backend is detected', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'codex', name: 'Codex', backend: 'codex', cliPath: 'codex' }),
      ]);
      const registry = await createFreshRegistry();
      await registry.initialize();
      expect(registry.hasAgents()).toBe(true);
    });

    it('should return false before initialization', async () => {
      const registry = await createFreshRegistry();
      expect(registry.hasAgents()).toBe(false);
    });
  });

  describe('refreshAll', () => {
    it('should re-run all detection paths', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();

      mockDetectBuiltinAgents.mockClear();
      mockDetectExtensionAgents.mockClear();

      await registry.refreshAll();

      expect(mockClearEnvCache).toHaveBeenCalled();
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
      expect(mockDetectExtensionAgents).not.toHaveBeenCalled();
    });
  });
});
