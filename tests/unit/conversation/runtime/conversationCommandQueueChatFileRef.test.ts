/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { projectFileRef, uploadFileRef } from '@/common/types/chatFile';
import {
  createQueuedCommandItem,
  normalizeQueueState,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

describe('conversation command queue ChatFileRef contract', () => {
  it('deduplicates by source-tagged identity', () => {
    const item = createQueuedCommandItem({
      input: 'inspect',
      files: [
        uploadFileRef('/tmp/a.txt'),
        projectFileRef('pe-1', 'a.txt'),
        uploadFileRef('/tmp/a.txt'),
        projectFileRef('pe-1', 'a.txt'),
      ],
    });
    expect(item.files).toEqual([
      { kind: 'upload', path: '/tmp/a.txt' },
      { kind: 'project', pe_id: 'pe-1', relative_path: 'a.txt' },
    ]);
  });

  it('rejects stale string-array queue payloads instead of sending an invalid body', () => {
    const state = normalizeQueueState({
      items: [{ id: 'old', input: 'inspect', files: ['/tmp/a.txt'], created_at: 1 }],
      isPaused: false,
    });
    expect(state.items).toEqual([]);
  });
});
