import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { __test__ } = require('../../../packages/shared-scripts/src/prepare-aioncore.js');

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-aioncore-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('prepare-aioncore download retry', () => {
  it('retries transient curl and wget failures, removing partial downloads before retry', () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, 'aioncore.tar.gz');
    const commands: string[] = [];
    const delays: number[] = [];

    __test__.downloadFile('https://example.invalid/aioncore.tar.gz', outputPath, {
      attempts: 2,
      retryDelayMs: 10,
      platform: 'darwin',
      sleep: (ms: number) => delays.push(ms),
      logger: { log() {}, warn() {} },
      execFileSync(command: string) {
        commands.push(command);
        if (commands.length <= 2) {
          fs.writeFileSync(outputPath, 'partial');
          throw new Error(`${command} transient failure`);
        }
        expect(fs.existsSync(outputPath)).toBe(false);
      },
    });

    expect(commands).toEqual(['curl', 'wget', 'curl']);
    expect(delays).toEqual([10]);
  });

  it('reports the final retry count when every download attempt fails', () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, 'aioncore.tar.gz');

    expect(() =>
      __test__.downloadFile('https://example.invalid/aioncore.tar.gz', outputPath, {
        attempts: 2,
        retryDelayMs: 1,
        platform: 'darwin',
        sleep() {},
        logger: { log() {}, warn() {} },
        execFileSync(command: string) {
          throw new Error(`${command} still down`);
        },
      })
    ).toThrow(/aioncore download failed after 2 attempts/);
  });

  it('uses the fallback for invalid positive integer environment values', () => {
    expect(__test__.parsePositiveInteger('3', 1)).toBe(3);
    expect(__test__.parsePositiveInteger('0', 4)).toBe(4);
    expect(__test__.parsePositiveInteger('not-a-number', 4)).toBe(4);
  });
});
