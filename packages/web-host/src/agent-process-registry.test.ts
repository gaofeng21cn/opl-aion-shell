import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanupRegisteredAgentProcesses, resolveAgentProcessRegistryPath } from './agent-process-registry.js';

function processNotFound(): Error & { code: string } {
  return Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
}

describe('cleanupRegisteredAgentProcesses', () => {
  const dataDirs: string[] = [];

  async function createDataDir(): Promise<string> {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    dataDirs.push(dataDir);
    return dataDir;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await Promise.all(dataDirs.splice(0).map((dataDir) => rm(dataDir, { recursive: true, force: true })));
  });

  it('kills a registered process group even when the wrapper pid has already exited', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await createDataDir();
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify({
        version: 1,
        processes: [
          {
            pid: 6883,
            process_group_id: 6883,
            conversation_id: 'conv-1',
            agent_type: 'acp',
            backend: 'codex',
            registered_at_ms: 1,
          },
        ],
      }),
      'utf8'
    );

    let groupAlive = true;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((
      target: number,
      signal?: NodeJS.Signals | number
    ) => {
      if (target === -6883 && signal === 0) {
        if (groupAlive) return true;
        throw processNotFound();
      }
      if (target === 6883 && signal === 0) {
        throw processNotFound();
      }
      if (target === -6883 && signal === 'SIGTERM') {
        groupAlive = false;
        return true;
      }
      if (target === -6883 && signal === 'SIGKILL') {
        groupAlive = false;
        return true;
      }
      throw processNotFound();
    }) as typeof process.kill);

    await cleanupRegisteredAgentProcesses(dataDir);

    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      processes: Array<{ pid: number }>;
    };

    expect(killSpy).toHaveBeenCalledWith(-6883, 'SIGTERM');
    expect(registry.processes).toEqual([]);
    expect((await readdir(path.dirname(registryPath))).some((entry) => entry.endsWith('.tmp'))).toBe(false);
  });

  it('quarantines a corrupt registry without aborting shutdown', async () => {
    const dataDir = await createDataDir();
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, '{"version":', 'utf8');

    await expect(cleanupRegisteredAgentProcesses(dataDir)).resolves.toBeUndefined();

    const entries = await readdir(path.dirname(registryPath));
    expect(entries.filter((entry) => entry.includes('.corrupt.'))).toHaveLength(1);
  });

  it('keeps a process registered concurrently during cleanup', async () => {
    if (process.platform === 'win32') return;

    const dataDir = await createDataDir();
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    const entryA = { pid: 65001, conversation_id: 'conv-a', agent_type: 'acp', registered_at_ms: 1 };
    const entryB = { pid: 65002, conversation_id: 'conv-b', agent_type: 'acp', registered_at_ms: 2 };
    await writeFile(registryPath, JSON.stringify({ version: 1, processes: [entryA] }), 'utf8');

    let registered = false;
    vi.spyOn(process, 'kill').mockImplementation(((target: number, signal?: NodeJS.Signals | number) => {
      if ((target === 65002 || target === -65002) && signal === 0) return true;
      if (!registered && (target === 65001 || target === -65001)) {
        registered = true;
        writeFileSync(registryPath, JSON.stringify({ version: 1, processes: [entryA, entryB] }), 'utf8');
      }
      throw processNotFound();
    }) as typeof process.kill);

    await cleanupRegisteredAgentProcesses(dataDir);

    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as { processes: Array<{ pid: number }> };
    expect(registry.processes.map((entry) => entry.pid)).toEqual([65002]);
  });
});
