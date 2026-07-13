import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ThreadCoordinationAuditEvent } from '@/common/types/codex/threadCoordination';
import { JsonlThreadCoordinationAuditStore } from '@/process/services/threadCoordination/auditStore';

const roots: string[] = [];

function event(id: string): ThreadCoordinationAuditEvent {
  return {
    schema: 'opl_codex_thread_coordination_audit.v1',
    id,
    observedAt: '2026-07-13T01:00:00.000Z',
    completedAt: '2026-07-13T01:00:01.000Z',
    actor: { kind: 'model', id: 'sender', threadId: 'thread-a' },
    action: 'deliver',
    senderThreadId: 'thread-a',
    receiverThreadId: 'thread-b',
    senderLabel: 'Sender',
    receiverLabel: 'Receiver',
    reason: 'Coordinate work',
    messageSummary: 'Inspect the boundary.',
    result: 'accepted',
    resultMessage: 'Accepted by turn/start.',
    protocolMethod: 'turn/start',
    permission: 'read_only',
    writeSet: [],
    permissionDecision: { requested: 'read_only', decision: 'allowed', reason: 'Read only.' },
    writeSetDecision: {
      requestedPathCount: 0,
      decision: 'not_applicable',
      reason: 'No write set.',
      conflictingThreadId: null,
    },
    threadStatusBefore: 'idle',
    threadStatusAfter: 'running',
    idempotencyKey: `key-${id}`,
    errorCode: null,
    advisories: [],
  };
}

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('JsonlThreadCoordinationAuditStore', () => {
  it('persists append-only events and reads newest entries first', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-coordination-audit-'));
    roots.push(root);
    const auditPath = path.join(root, 'audit', 'events.jsonl');
    const store = new JsonlThreadCoordinationAuditStore(auditPath);

    store.append(event('one'));
    store.append(event('two'));

    expect(store.readRecent(1).map((entry) => entry.id)).toEqual(['two']);
    expect(store.hasIdempotencyKey('key-one')).toBe(true);
  });

  it('ignores a damaged line without losing valid audit history', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-coordination-audit-'));
    roots.push(root);
    const auditPath = path.join(root, 'events.jsonl');
    const store = new JsonlThreadCoordinationAuditStore(auditPath);
    store.append(event('valid'));
    fs.appendFileSync(auditPath, '{damaged\n');

    expect(store.readRecent(10).map((entry) => entry.id)).toEqual(['valid']);
  });
});
