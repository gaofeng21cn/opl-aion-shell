import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { resolveAcpAdapters } from '../../src/process/extensions/resolvers/AcpAdapterResolver';
import { ExtensionLoader } from '../../src/process/extensions/ExtensionLoader';
import type { LoadedExtension } from '../../src/process/extensions/types';

const oplCliEntry = path.resolve(process.cwd(), '../one-person-lab/src/cli.ts');

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

describe('integration/oplAcpBridgeSmoke', () => {

  it('discovers the OPL ACP adapter through Aion extension loading and completes a real initialize + session_create smoke', async () => {
    process.env.OPL_ACP_BRIDGE_CMD = resolveNodeExecutable();
    process.env.OPL_ACP_BRIDGE_ENTRY = oplCliEntry;
    process.env.AIONUI_EXTENSIONS_PATH = path.resolve(process.cwd(), 'examples');

    const loader = new ExtensionLoader({ continueOnError: false });
    const loadedExtensions = await loader.loadAll();
    const oplExtension = loadedExtensions.find((entry) => entry.manifest.name === 'opl-acp-extension') as
      | LoadedExtension
      | undefined;

    expect(oplExtension).toBeTruthy();
    const adapter = resolveAcpAdapters([oplExtension as LoadedExtension])[0] as {
      cliCommand: string;
      acpArgs: string[];
    };

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
      cwd: path.resolve(process.cwd(), '../one-person-lab'),
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
  });
});
