import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { AcpSessionUpdate } from '../../src/common/types/acpTypes';
import type { AcpDetectedAgent } from '../../src/common/types/detectedAgent';
import { agentRegistry } from '../../src/process/agent/AgentRegistry';
import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';
import { resolveAcpAdapters } from '../../src/process/extensions/resolvers/AcpAdapterResolver';
import { ExtensionLoader } from '../../src/process/extensions/ExtensionLoader';
import { ExtensionRegistry } from '../../src/process/extensions/ExtensionRegistry';
import type { LoadedExtension } from '../../src/process/extensions/types';

type OplAdapter = {
  id: string;
  cliCommand: string;
  acpArgs: string[];
};

function resolveOplWorkspaceRoot() {
  const candidates = [
    path.resolve(process.cwd(), '../../one-person-lab'),
    path.resolve(process.cwd(), '../one-person-lab'),
    '/Users/gaofeng/workspace/one-person-lab',
  ];

  const resolved = candidates.find((candidate) => fs.existsSync(path.resolve(candidate, 'src/cli.ts')));
  if (!resolved) {
    throw new Error('Failed to resolve one-person-lab workspace root for OPL ACP smoke tests.');
  }
  return resolved;
}

function applyEnvOverrides(overrides: Record<string, string>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  };
}

function resolveNodeExecutable() {
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    execFileSync('/bin/sh', ['-lc', 'command -v node'], {
      encoding: 'utf8',
    }).trim(),
  ];

  const resolved = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!resolved) {
    throw new Error('Failed to resolve a runnable node executable for OPL ACP smoke tests.');
  }
  return resolved;
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function createFakeCodexExecutable(tempDir: string) {
  const fakeCodexPath = path.join(tempDir, 'codex');
  const script = `#!/usr/bin/env node
const prompt = process.argv[process.argv.length - 1] ?? '';
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'opl-acp-smoke-thread' }) + '\\n');
process.stdout.write(JSON.stringify({ item: { type: 'agent_message', text: \`Fake Codex reply: \${prompt}\` } }) + '\\n');
`;
  fs.writeFileSync(fakeCodexPath, script, { encoding: 'utf8', mode: 0o755 });
  return fakeCodexPath;
}

function createIsolatedOplExtensionRoot() {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-acp-ext-'));
  const sourceDir = path.resolve(aionExamplesPath, 'opl-acp-adapter-extension');
  const targetDir = path.resolve(isolatedRoot, 'opl-acp-adapter-extension');
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return isolatedRoot;
}

const oplWorkspaceRoot = resolveOplWorkspaceRoot();
const oplCliEntry = path.resolve(oplWorkspaceRoot, 'src/cli.ts');
const aionExamplesPath = path.resolve(process.cwd(), 'examples');

describe('integration/oplAcpBridgeSmoke', () => {
  it('discovers the OPL ACP adapter through Aion extension loading and completes a real initialize + session_create smoke', async () => {
    const isolatedExtensionsPath = createIsolatedOplExtensionRoot();
    const restoreEnv = applyEnvOverrides({
      OPL_ACP_BRIDGE_CMD: resolveNodeExecutable(),
      OPL_ACP_BRIDGE_ENTRY: oplCliEntry,
      AIONUI_EXTENSIONS_PATH: isolatedExtensionsPath,
      AIONUI_E2E_TEST: '1',
    });

    try {
      const loader = new ExtensionLoader({ continueOnError: false });
      const loadedExtensions = await loader.loadAll();
      const oplExtension = loadedExtensions.find((entry) => entry.manifest.name === 'opl-acp-extension') as
        | LoadedExtension
        | undefined;

      expect(oplExtension).toBeTruthy();
      const adapter = resolveAcpAdapters([oplExtension as LoadedExtension])[0] as OplAdapter;
      expect(adapter.id).toBe('opl-acp');

      const requests = [
        { id: 'opl-init-1', command: 'initialize' },
        {
          id: 'opl-create-1',
          command: 'session_create',
          payload: {
            version: 'g2',
            session_create: {
              surface_id: 'opl_session_create',
              request_mode: 'submitted',
              payload: {
                product_entry: {
                  entry_surface: 'opl_session_api',
                  mode: 'ask',
                  seed: {
                    session_id: 'sess-aion-smoke-1',
                  },
                  task: {
                    task_id: 'task-aion-smoke-1',
                    status: 'accepted',
                    stage: 'queued',
                    summary: 'request accepted',
                    executor_backend: 'codex',
                    session_id: null,
                  },
                },
              },
            },
          },
        },
      ];

      const shellCommand = `${`printf '%s\\n' ${requests.map((entry) => shellSingleQuote(JSON.stringify(entry))).join(' ')}`} | ${[
        shellSingleQuote(adapter.cliCommand),
        ...adapter.acpArgs.map((entry) => shellSingleQuote(entry)),
      ].join(' ')}`;

      const stdout = execFileSync('/bin/sh', ['-lc', shellCommand], {
        cwd: oplWorkspaceRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
        },
        encoding: 'utf8',
      });

      const responses = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const initialize = responses.find((entry) => entry.id === 'opl-init-1') as Record<string, unknown> | undefined;
      const created = responses.find((entry) => entry.id === 'opl-create-1') as Record<string, unknown> | undefined;

      expect(initialize?.ok).toBe(true);
      expect((initialize?.result as { surface_id: string }).surface_id).toBe('opl_acp_stdio_bridge');
      expect(created?.ok).toBe(true);
      expect((created?.result as { session_id: string }).session_id).toBe('sess-aion-smoke-1');
      expect(
        ((created?.result as { task_acceptance: { task_id: string } }).task_acceptance).task_id,
      ).toBe('task-aion-smoke-1');
    } finally {
      fs.rmSync(isolatedExtensionsPath, { recursive: true, force: true });
      restoreEnv();
    }
  });

  it('wires OPL adapter into detected agents and drives a real ACP session via AcpConnection', async () => {
    const isolatedExtensionsPath = createIsolatedOplExtensionRoot();
    const restoreEnv = applyEnvOverrides({
      OPL_ACP_BRIDGE_CMD: resolveNodeExecutable(),
      OPL_ACP_BRIDGE_ENTRY: oplCliEntry,
      AIONUI_EXTENSIONS_PATH: isolatedExtensionsPath,
      AIONUI_E2E_TEST: '1',
    });
    const fakeCodexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-acp-smoke-'));
    const fakeCodexPath = createFakeCodexExecutable(fakeCodexDir);
    const updates: AcpSessionUpdate[] = [];
    const connection = new AcpConnection();

    try {
      const extensionRegistry = ExtensionRegistry.getInstance();
      await extensionRegistry.initialize();
      const adapter = extensionRegistry
        .getAcpAdapters()
        .find((entry) => (entry as { id?: unknown }).id === 'opl-acp') as OplAdapter | undefined;

      expect(adapter).toBeTruthy();

      await agentRegistry.refreshExtensionAgents();
      const detectedAgent = agentRegistry
        .getDetectedAgents()
        .find((agent) => agent.kind === 'acp' && agent.backend === 'opl-acp') as AcpDetectedAgent | undefined;
      expect(detectedAgent).toBeTruthy();

      connection.onSessionUpdate = (update) => {
        updates.push(update);
      };

      await connection.connect(
        'custom',
        detectedAgent?.cliPath ?? adapter?.cliCommand ?? '',
        oplWorkspaceRoot,
        detectedAgent?.acpArgs ?? adapter?.acpArgs ?? [],
        {
          OPL_CODEX_BIN: fakeCodexPath,
          NODE_NO_WARNINGS: '1',
        },
      );

      const initializeResult = connection.getInitializeResult();
      expect(initializeResult?.protocolVersion).toBe(1);
      expect(initializeResult?.agentInfo.name).toBe('opl-session-runtime');

      const session = await connection.newSession(oplWorkspaceRoot);
      expect(session.sessionId).toBeTruthy();

      const promptResult = await connection.sendPrompt('Aion ACP smoke prompt');
      expect(promptResult.stopReason).toBe('end_turn');

      const chunkUpdates = updates.filter(
        (entry) => entry.update.sessionUpdate === 'agent_message_chunk',
      ) as Array<{ update: { content?: { type?: string; text?: string } } }>;
      expect(chunkUpdates.length).toBeGreaterThan(0);
      expect(
        chunkUpdates.some((entry) => entry.update.content?.type === 'text' && entry.update.content.text?.length),
      ).toBe(true);
      expect(
        chunkUpdates.some((entry) => entry.update.content?.text?.includes('Fake Codex reply:')),
      ).toBe(true);
    } finally {
      await connection.disconnect().catch(() => undefined);
      fs.rmSync(isolatedExtensionsPath, { recursive: true, force: true });
      fs.rmSync(fakeCodexDir, { recursive: true, force: true });
      restoreEnv();
    }
  });

  it('exposes OPL adapter and detected agent with consistent backend identity for UI list consumption', async () => {
    const isolatedExtensionsPath = createIsolatedOplExtensionRoot();
    const restoreEnv = applyEnvOverrides({
      OPL_ACP_BRIDGE_CMD: resolveNodeExecutable(),
      OPL_ACP_BRIDGE_ENTRY: oplCliEntry,
      AIONUI_EXTENSIONS_PATH: isolatedExtensionsPath,
      AIONUI_E2E_TEST: '1',
    });

    try {
      const extensionRegistry = ExtensionRegistry.getInstance();
      await extensionRegistry.initialize();

      const adapter = extensionRegistry
        .getAcpAdapters()
        .find((entry) => (entry as { id?: unknown }).id === 'opl-acp') as OplAdapter | undefined;
      expect(adapter).toBeTruthy();

      await agentRegistry.refreshExtensionAgents();
      const detected = agentRegistry
        .getDetectedAgents()
        .find((agent) => agent.kind === 'acp' && agent.backend === 'opl-acp') as AcpDetectedAgent | undefined;
      expect(detected).toBeTruthy();
      expect(detected?.isExtension).toBe(true);
      expect(detected?.extensionName).toBe('opl-acp-extension');

      // UI side uses adapter list + detected agent list by backend key.
      expect(detected?.backend).toBe(adapter?.id);
      expect(detected?.name).toBe(adapter?.name);
    } finally {
      fs.rmSync(isolatedExtensionsPath, { recursive: true, force: true });
      restoreEnv();
    }
  });
});
