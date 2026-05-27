import path from 'path';
import fs from 'fs';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { buildOplHostToolEnv } from '@/process/backend/hostToolEnv';

const POSIX_HOST_TOOL_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

describe('buildOplHostToolEnv', () => {
  it('prepends OPL runtime and common host Node toolchain locations without dropping the existing PATH', () => {
    const homeDir = process.platform === 'win32' ? 'C:\\Users\\tester' : '/Users/tester';
    const runtimeBin = path.join(homeDir, 'runtime', 'current', 'bin');
    const runtimeNodeBin = path.join(homeDir, 'runtime', 'current', 'node', 'bin');
    const customNodeBin = path.join(homeDir, 'custom', 'node', 'bin');
    const npmGlobalBin = path.join(homeDir, '.npm-global', 'bin');
    const baseBin = path.join(homeDir, 'existing', 'bin');

    const env = buildOplHostToolEnv({
      baseEnv: { PATH: baseBin, HOME: homeDir },
      runtimeEnv: {
        OPL_FULL_RUNTIME_HOME: path.join(homeDir, 'runtime', 'current'),
        PATH: [runtimeBin, runtimeNodeBin].join(path.delimiter),
      },
      extraPathEntries: [customNodeBin, baseBin],
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    const expectedPrefix = [runtimeBin, runtimeNodeBin, customNodeBin];
    if (process.platform !== 'win32') {
      expectedPrefix.push(npmGlobalBin);
    }
    expect(entries.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
    for (const hostToolPath of POSIX_HOST_TOOL_PATHS) {
      if (process.platform !== 'win32') {
        expect(entries).toContain(hostToolPath);
      } else {
        expect(entries).not.toContain(hostToolPath);
      }
    }
    expect(entries.at(-1)).toBe(baseBin);
    expect(new Set(entries).size).toBe(entries.length);
    expect(env.OPL_FULL_RUNTIME_HOME).toBe(path.join(homeDir, 'runtime', 'current'));
  });

  it('expands installed nvm Node versions instead of passing wildcard PATH entries to backend spawns', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-host-env-'));
    const nvmNodeBin = path.join(homeDir, '.nvm', 'versions', 'node', 'v22.11.0', 'bin');
    fs.mkdirSync(nvmNodeBin, { recursive: true });

    const env = buildOplHostToolEnv({
      baseEnv: { PATH: '/existing/bin', HOME: homeDir },
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    expect(entries).toContain(nvmNodeBin);
    expect(entries).not.toContain(path.join(homeDir, '.nvm', 'versions', 'node', '*', 'bin'));
  });
});
