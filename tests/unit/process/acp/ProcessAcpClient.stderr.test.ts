import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { ProcessAcpClient } from '@/process/acp/infra/ProcessAcpClient';

class FakeReadable extends EventEmitter {
  destroy = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  pipe = vi.fn();
  unpipe = vi.fn();
  read = vi.fn();
  setEncoding = vi.fn();
}

describe('ProcessAcpClient stderr capture', () => {
  it('truncates oversized stderr chunks before writing them to console', () => {
    const stderr = new FakeReadable();
    const child = { stderr } as unknown as ChildProcess;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new ProcessAcpClient(async () => child, {
      backend: 'codex',
      handlers: {
        onSessionUpdate: vi.fn(),
        onRequestPermission: vi.fn(),
        onReadTextFile: vi.fn(),
        onWriteTextFile: vi.fn(),
      },
    });

    (client as unknown as { setupStderrCapture: (child: ChildProcess) => void }).setupStderrCapture(child);
    stderr.emit('data', Buffer.from('x'.repeat(9000)));

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls[0][1] as string;
    expect(logged.length).toBeLessThan(8500);
    expect(logged).toContain('truncated 808 chars');
    expect((client as unknown as { stderrBuffer: string }).stderrBuffer).toHaveLength(8192);

    consoleError.mockRestore();
  });
});
