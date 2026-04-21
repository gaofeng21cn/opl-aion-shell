import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveAcpAdapters } from '../../../src/process/extensions/resolvers/AcpAdapterResolver';
import { ExtensionManifestSchema, type LoadedExtension } from '../../../src/process/extensions/types';

const fixtureRoot = path.resolve(__dirname, '../../fixtures/opl-acp-extension');
const manifestPath = path.join(fixtureRoot, 'aion-extension.json');

describe('extensions/AcpAdapterResolver', () => {
  it('loads the OPL ACP fixture manifest and resolves an ACP adapter entry', () => {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const parsed = ExtensionManifestSchema.safeParse(raw);

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
      cliCommand: 'opl',
      defaultCliPath: 'opl',
      connectionType: 'cli',
      acpArgs: ['session-runtime', '--acp'],
      _source: 'extension',
      _extensionName: 'opl-acp-extension',
    });
  });
});
