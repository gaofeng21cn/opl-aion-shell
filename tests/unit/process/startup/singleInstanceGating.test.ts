/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldRegisterBackendStartup } from '@/process/startup/singleInstanceGating';

describe('shouldRegisterBackendStartup', () => {
  it('registers backend startup only for the single-instance lock owner', () => {
    expect(shouldRegisterBackendStartup(true)).toBe(true);
    expect(shouldRegisterBackendStartup(false)).toBe(false);
  });
});
