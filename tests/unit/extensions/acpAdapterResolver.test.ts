import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import { resolveAcpAdapters } from '../../../src/process/extensions/resolvers/AcpAdapterResolver';
import { resolveEnvInObject } from '../../../src/process/extensions/resolvers/utils/envResolver';
import { ExtensionManifestSchema, type LoadedExtension } from '../../../src/process/extensions/types';

const fixtureRoot = path.resolve(__dirname, '../../fixtures/opl-acp-extension');
const manifestPath = path.join(fixtureRoot, 'aion-extension.json');

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

describe('extensions/AcpAdapterResolver', () => {
  it('loads the OPL ACP fixture manifest and resolves an ACP adapter entry', () => {
    const nodeExecutable = resolveNodeExecutable();
    process.env.OPL_ACP_BRIDGE_CMD = nodeExecutable;
    process.env.OPL_ACP_BRIDGE_ENTRY = '/tmp/opl-cli-entry.ts';
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const resolved = resolveEnvInObject(raw);
    const parsed = ExtensionManifestSchema.safeParse(resolved);

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    const loadedExtension: LoadedExtension = {
      manifest: parsed.data,
      directory: fixtureRoot,
      source: 'env',
    };

    const adapters = resolveAcpAdapters([loadedExtension]);
    expect(adapters).toHaveLength(1);
    expect(adapters[0]).toMatchObject({
      id: 'opl-acp',
      name: 'OPL',
      cliCommand: nodeExecutable,
      defaultCliPath: nodeExecutable,
      connectionType: 'cli',
      acpArgs: ['--experimental-strip-types', '/tmp/opl-cli-entry.ts', 'session', 'runtime', '--acp'],
      description: 'Launch the local OPL GUI shell on the Codex-default session path.',
      supportsStreaming: true,
      _source: 'extension',
      _extensionName: 'opl-acp-extension',
    });
  });
});
