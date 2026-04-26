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
  it('should have uk-UA as a supported language', () => {
    expect(SUPPORTED_LANGUAGES).toContain('uk-UA');
  });

  it('should normalize uk-UA correctly', () => {
    // Test if normalizeLanguageCode handles uk-UA or similar variants
    expect(normalizeLanguageCode('uk')).toBe('uk-UA');
    expect(normalizeLanguageCode('uk-UA')).toBe('uk-UA');
    expect(normalizeLanguageCode('UK-UA')).toBe('uk-UA');
  });

  it('should normalize macOS Simplified Chinese system language to zh-CN', () => {
    expect(normalizeLanguageCode('zh-Hans-CN')).toBe('zh-CN');
    expect(tryNormalizeLanguageCode('fr-FR')).toBeUndefined();
  });

  it('should prefer saved language, then system language, then fallback language', () => {
    expect(
      resolveInitialLanguage({
        savedLanguage: 'ja-JP',
        systemLanguages: ['zh-Hans-CN'],
      })
    ).toBe('ja-JP');
    expect(
      resolveInitialLanguage({
        systemLanguages: ['fr-FR', 'zh-Hans-CN', 'en-CN'],
      })
    ).toBe('zh-CN');
    expect(resolveInitialLanguage({ fallbackLanguage: 'tr' })).toBe('tr-TR');
  });

  it('should have enough supported languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(6);
  });
});
