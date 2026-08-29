/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  chatFileRefKey,
  chatFileRefPath,
  isChatFileRef,
  localFileRef,
  projectFileRef,
  uploadFileRef,
} from '@/common/types/chatFile';

describe('ChatFileRef', () => {
  it('builds all AionCore source-tagged variants', () => {
    expect(projectFileRef('pe-1', 'src/a.ts')).toEqual({ kind: 'project', pe_id: 'pe-1', relative_path: 'src/a.ts' });
    expect(uploadFileRef('/tmp/a.png')).toEqual({ kind: 'upload', path: '/tmp/a.png' });
    expect(localFileRef('/projects/a.ts')).toEqual({ kind: 'local', path: '/projects/a.ts' });
  });

  it('keeps project identity and source kind in dedup keys', () => {
    expect(chatFileRefKey(projectFileRef('pe-1', 'a.ts'))).toBe('project\0pe-1\0a.ts');
    expect(chatFileRefKey(uploadFileRef('/same'))).not.toBe(chatFileRefKey(localFileRef('/same')));
  });

  it('returns the carried path and validates only supported shapes', () => {
    expect(chatFileRefPath(projectFileRef('pe-1', 'a.ts'))).toBe('a.ts');
    expect(chatFileRefPath(uploadFileRef('/tmp/a.ts'))).toBe('/tmp/a.ts');
    expect(isChatFileRef({ kind: 'local', path: '/projects/a.ts' })).toBe(true);
    expect(isChatFileRef({ kind: 'project', pe_id: 'pe-1' })).toBe(false);
    expect(isChatFileRef('/tmp/a.ts')).toBe(false);
  });
});
