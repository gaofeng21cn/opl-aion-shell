/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  resolveInitialLanguage,
  tryNormalizeLanguageCode,
} from '@/common/config/i18n';

describe('common i18n config module', () => {
  it('should support only Simplified Chinese and English', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['zh-CN', 'en-US']);
  });

  it('should fall back to English for unsupported locales', () => {
    expect(normalizeLanguageCode('uk')).toBe('en-US');
    expect(normalizeLanguageCode('fr-FR')).toBe('en-US');
    expect(normalizeLanguageCode('tr')).toBe('en-US');
  });

  it('should normalize macOS Simplified Chinese system language to zh-CN', () => {
    expect(normalizeLanguageCode('zh-Hans-CN')).toBe('zh-CN');
    expect(tryNormalizeLanguageCode('fr-FR')).toBeUndefined();
  });

  it('should prefer saved language, then system language, then fallback language within supported locales', () => {
    expect(
      resolveInitialLanguage({
        savedLanguage: 'en-US',
        systemLanguages: ['zh-Hans-CN'],
      })
    ).toBe('en-US');
    expect(
      resolveInitialLanguage({
        systemLanguages: ['fr-FR', 'zh-Hans-CN', 'en-CN'],
      })
    ).toBe('zh-CN');
    expect(resolveInitialLanguage({ fallbackLanguage: 'tr' })).toBe('en-US');
  });
});
