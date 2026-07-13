/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ThreadCoordinationAuditEvent } from '@/common/types/codex/threadCoordination';

export type ThreadCoordinationAuditStore = {
  append: (event: ThreadCoordinationAuditEvent) => void;
  readRecent: (limit: number) => ThreadCoordinationAuditEvent[];
  hasIdempotencyKey: (idempotencyKey: string) => boolean;
};

function isAuditEvent(value: unknown): value is ThreadCoordinationAuditEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.schema === 'opl_codex_thread_coordination_audit.v1' && typeof record.id === 'string';
}

export class JsonlThreadCoordinationAuditStore implements ThreadCoordinationAuditStore {
  constructor(private readonly auditPath: string) {}

  append(event: ThreadCoordinationAuditEvent): void {
    fs.mkdirSync(path.dirname(this.auditPath), { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.auditPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  readRecent(limit: number): ThreadCoordinationAuditEvent[] {
    if (limit <= 0 || !fs.existsSync(this.auditPath)) return [];
    const lines = fs.readFileSync(this.auditPath, 'utf8').split('\n').filter(Boolean);
    const events: ThreadCoordinationAuditEvent[] = [];
    for (let index = lines.length - 1; index >= 0 && events.length < limit; index -= 1) {
      try {
        const value: unknown = JSON.parse(lines[index]);
        if (isAuditEvent(value)) events.push(value);
      } catch {
        // Ignore a damaged line while preserving the remaining append-only audit.
      }
    }
    return events;
  }

  hasIdempotencyKey(idempotencyKey: string): boolean {
    if (!idempotencyKey || !fs.existsSync(this.auditPath)) return false;
    return this.readRecent(500).some((event) => event.idempotencyKey === idempotencyKey);
  }
}
