import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveAcpAdapters } from '../../../src/process/extensions/resolvers/AcpAdapterResolver';
import { resolveEnvInObject } from '../../../src/process/extensions/resolvers/utils/envResolver';
import { ExtensionManifestSchema, type LoadedExtension } from '../../../src/process/extensions/types';

const fixtureRoot = path.resolve(__dirname, '../../fixtures/opl-acp-extension');
const manifestPath = path.join(fixtureRoot, 'aion-extension.json');

describe('extensions/AcpAdapterResolver', () => {
  it('loads the OPL ACP fixture manifest and resolves an ACP adapter entry', () => {
    process.env.OPL_ACP_BRIDGE_CMD = process.execPath;
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
      name: 'OPL ACP Adapter',
      cliCommand: process.execPath,
      defaultCliPath: process.execPath,
      connectionType: 'cli',
      acpArgs: ['--experimental-strip-types', '/tmp/opl-cli-entry.ts', 'session', 'runtime', '--acp'],
      _source: 'extension',
      _extensionName: 'opl-acp-extension',
    });
  });
});
