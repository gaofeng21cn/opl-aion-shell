import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildLaunchEnv, resolveLaunchExtensionsPath } from '../../../../scripts/launch-env.mjs';

const tempRoots: string[] = [];

function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/launch-env', () => {
  it('maps --opl to the isolated OPL extension root', () => {
    const projectRoot = createTempRoot('aionui-launch-env-');
    const flags = new Set(['--opl']);

    expect(resolveLaunchExtensionsPath(projectRoot, flags)).toBe(
      path.join(projectRoot, 'examples', 'opl-acp-adapter-extension')
    );
  });

  it('injects OPL ACP bridge env when launching in --opl mode', () => {
    const workspaceRoot = createTempRoot('aionui-launch-workspace-');
    const projectRoot = path.join(workspaceRoot, 'opl-aion-shell');
    const oplRoot = path.join(workspaceRoot, 'one-person-lab');
    fs.mkdirSync(path.join(projectRoot, 'examples', 'opl-acp-adapter-extension'), { recursive: true });
    fs.mkdirSync(path.join(oplRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(oplRoot, 'src', 'cli.ts'), '');

    const flags = new Set(['--opl']);
    const env = withEnv(
      {
        OPL_ACP_BRIDGE_CMD: undefined,
        OPL_ACP_BRIDGE_ENTRY: undefined,
        AIONUI_EXTENSIONS_PATH: undefined,
      },
      () => buildLaunchEnv(projectRoot, flags)
    );

    expect(env.AIONUI_EXTENSIONS_PATH).toBe(path.join(projectRoot, 'examples', 'opl-acp-adapter-extension'));
    expect(env.OPL_ACP_BRIDGE_CMD).toBe(process.execPath);
    expect(env.OPL_ACP_BRIDGE_ENTRY).toBe(path.join(oplRoot, 'src', 'cli.ts'));
  });
});
