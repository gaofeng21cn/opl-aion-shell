import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

import { resolveEnvInObject } from '../../src/process/extensions/resolvers/utils/envResolver';
import { resolveAcpAdapters } from '../../src/process/extensions/resolvers/AcpAdapterResolver';
import { ExtensionManifestSchema, type LoadedExtension } from '../../src/process/extensions/types';

const fixtureRoot = path.resolve(__dirname, '../fixtures/opl-acp-extension');
const manifestPath = path.join(fixtureRoot, 'aion-extension.json');
const oplCliEntry = path.resolve(__dirname, '../../../..', 'one-person-lab', 'src', 'cli.ts');

function writeJsonLine(stream: NodeJS.WritableStream, payload: Record<string, unknown>) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

function waitForJsonLine(
  stream: NodeJS.ReadableStream,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 10000,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const payload = JSON.parse(line) as Record<string, unknown>;
        if (predicate(payload)) {
          clearTimeout(timer);
          stream.off('data', onData);
          resolve(payload);
          return;
        }
      }
    };

    stream.on('data', onData);
    stream.once('error', reject);
  });
}

describe('integration/oplAcpBridgeSmoke', () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    if (child && !child.killed) {
      child.kill();
    }
    child = null;
  });

  it('resolves the OPL ACP adapter fixture and completes a real initialize + session_create smoke', async () => {
    process.env.OPL_ACP_BRIDGE_CMD = process.execPath;
    process.env.OPL_ACP_BRIDGE_ENTRY = oplCliEntry;

    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const resolved = resolveEnvInObject(raw);
    const parsed = ExtensionManifestSchema.parse(resolved);

    const loadedExtension: LoadedExtension = {
      manifest: parsed,
      directory: fixtureRoot,
      source: 'env',
    };
    const adapter = resolveAcpAdapters([loadedExtension])[0] as {
      cliCommand: string;
      acpArgs: string[];
    };

    child = spawn(adapter.cliCommand, adapter.acpArgs, {
      cwd: path.resolve(__dirname, '../../../..', 'one-person-lab'),
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    writeJsonLine(child.stdin!, {
      id: 'opl-init-1',
      command: 'initialize',
    });
    const initialize = await waitForJsonLine(child.stdout!, (payload) => payload.id === 'opl-init-1');
    expect(initialize.ok).toBe(true);
    expect((initialize.result as { surface_id: string }).surface_id).toBe('opl_acp_stdio_bridge');

    writeJsonLine(child.stdin!, {
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
    });
    const created = await waitForJsonLine(child.stdout!, (payload) => payload.id === 'opl-create-1');
    expect(created.ok).toBe(true);
    expect((created.result as { session_id: string }).session_id).toBe('sess-aion-smoke-1');
    expect(
      ((created.result as { task_acceptance: { task_id: string } }).task_acceptance).task_id,
    ).toBe('task-aion-smoke-1');
  });
});
