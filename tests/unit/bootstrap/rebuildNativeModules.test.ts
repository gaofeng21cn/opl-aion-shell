import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { getBunxCommand, resolveBunExecutable } = require('../../../scripts/rebuildNativeModules.js');

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-native-modules-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('native rebuild Bun resolution', () => {
  it('uses the exact BUN_EXECUTABLE file without requiring a PATH mutation', () => {
    const bunExecutable = path.join(makeTempDir(), 'bun.exe');
    fs.writeFileSync(bunExecutable, 'fixture');

    expect(
      resolveBunExecutable({
        env: { BUN_EXECUTABLE: bunExecutable },
        execPath: path.join(path.dirname(bunExecutable), 'node.exe'),
      })
    ).toBe(bunExecutable);
  });

  it('quotes an explicit Bun executable whose path contains spaces', () => {
    const bunExecutable = path.join(makeTempDir(), 'Bun Runtime', 'bun.exe');
    fs.mkdirSync(path.dirname(bunExecutable), { recursive: true });
    fs.writeFileSync(bunExecutable, 'fixture');

    expect(
      getBunxCommand({
        env: { BUN_EXECUTABLE: bunExecutable },
        execPath: path.join(path.dirname(bunExecutable), 'node.exe'),
      })
    ).toBe(`"${bunExecutable}" x`);
  });

  it('fails closed when BUN_EXECUTABLE does not resolve to a file', () => {
    const missingExecutable = path.join(makeTempDir(), 'missing', 'bun.exe');

    expect(() =>
      resolveBunExecutable({
        env: { BUN_EXECUTABLE: missingExecutable },
        execPath: path.join(path.dirname(missingExecutable), 'node.exe'),
      })
    ).toThrow(/BUN_EXECUTABLE does not resolve to a file/);
  });
});
