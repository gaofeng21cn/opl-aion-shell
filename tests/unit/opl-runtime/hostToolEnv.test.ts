import path from 'path';
import fs from 'fs';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { buildOplHostToolEnv } from '@/process/backend/hostToolEnv';

describe('buildOplHostToolEnv', () => {
  it('prepends OPL runtime and common host Node toolchain locations without dropping the existing PATH', () => {
    const env = buildOplHostToolEnv({
      baseEnv: { PATH: '/existing/bin', HOME: '/Users/tester' },
      runtimeEnv: {
        OPL_FULL_RUNTIME_HOME: '/opt/opl/runtime/current',
        PATH: ['/opt/opl/runtime/current/bin', '/opt/opl/runtime/current/node/bin'].join(path.delimiter),
      },
      extraPathEntries: ['/custom/node/bin', '/existing/bin'],
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    expect(entries.slice(0, 4)).toEqual([
      '/opt/opl/runtime/current/bin',
      '/opt/opl/runtime/current/node/bin',
      '/custom/node/bin',
      '/Users/tester/.npm-global/bin',
    ]);
    expect(entries).toContain('/opt/homebrew/bin');
    expect(entries).toContain('/usr/local/bin');
    expect(entries).toContain('/usr/bin');
    expect(entries.at(-1)).toBe('/existing/bin');
    expect(new Set(entries).size).toBe(entries.length);
    expect(env.OPL_FULL_RUNTIME_HOME).toBe('/opt/opl/runtime/current');
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
