import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAcpAdapters = vi.fn();

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: mockGetAcpAdapters,
    }),
  },
}));

vi.mock('@process/utils/safeExec', () => ({
  safeExec: vi.fn(),
  safeExecFile: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
  },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => process.env),
}));

describe('AcpDetector.detectExtensionAgents', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAcpAdapters.mockReset();
  });

  it('should attach extension customAgentId so UI sessions can launch via extension manifest config', async () => {
    mockGetAcpAdapters.mockReturnValue([
      {
        id: 'opl-acp',
        name: 'OPL ACP',
        cliCommand: 'node',
        defaultCliPath: '/usr/local/bin/node',
        acpArgs: ['--experimental-strip-types', '/tmp/opl-cli.ts', 'session', 'runtime', '--acp'],
        _extensionName: 'opl-acp-extension',
        connectionType: 'cli',
      },
    ]);

    const { acpDetector } = await import('@process/agent/acp/AcpDetector');
    const agents = await acpDetector.detectExtensionAgents();

    expect(agents).toEqual([
      expect.objectContaining({
        id: 'opl-acp',
        name: 'OPL ACP',
        backend: 'opl-acp',
        cliPath: '/usr/local/bin/node',
        acpArgs: ['--experimental-strip-types', '/tmp/opl-cli.ts', 'session', 'runtime', '--acp'],
        isExtension: true,
        extensionName: 'opl-acp-extension',
        customAgentId: 'ext:opl-acp-extension:opl-acp',
      }),
    ]);
  });
});
