/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readCodexDefaultModelIdFromConfig } from '../../src/process/agent/acp/utils';

describe('readCodexDefaultModelIdFromConfig', () => {
  it('combines Codex model and reasoning effort for ACP model sync', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-codex-defaults-'));
    const codexHome = path.join(root, '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      [
        'model_provider = "gflab"',
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        '',
        '[model_providers.gflab]',
        'name = "gflab"',
      ].join('\n'),
      'utf8'
    );

    expect(readCodexDefaultModelIdFromConfig({ CODEX_HOME: codexHome })).toBe('gpt-5.5/xhigh');
  });

  it('keeps explicit slash-suffixed model ids unchanged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-codex-defaults-'));
    const codexHome = path.join(root, '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'config.toml'), 'model = "gpt-5.5/xhigh"\n', 'utf8');

    expect(readCodexDefaultModelIdFromConfig({ CODEX_HOME: codexHome })).toBe('gpt-5.5/xhigh');
  });
});
