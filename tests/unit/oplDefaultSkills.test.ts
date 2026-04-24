/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mergeOplDefaultCodexSkills, OPL_DEFAULT_CODEX_SKILLS } from '@/common/config/oplSkills';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';

describe('OPL default Codex skills', () => {
  it('adds MAS, MAG, and RCA to plain Codex conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'One Person Lab',
      workspace: '/tmp/opl',
      model: {},
    });

    expect(params.extra?.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS]);
  });

  it('preserves user-enabled skills after the OPL default family skills', () => {
    expect(mergeOplDefaultCodexSkills(['officecli', 'mas'])).toEqual(['mas', 'mag', 'rca', 'officecli']);
  });
});
