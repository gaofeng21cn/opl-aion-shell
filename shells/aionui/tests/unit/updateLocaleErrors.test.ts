/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import i18nConfig from '@/common/config/i18n-config.json';

const locales = import.meta.glob<Record<string, unknown>>('../../src/renderer/services/i18n/locales/*/update.json', {
  eager: true,
  import: 'default',
});

const REQUIRED_UPDATE_ERROR_KEYS = [
  'invalidUrl',
  'httpsOnly',
  'hostNotAllowed',
  'redirectNoLocation',
  'tooManyRedirects',
  'githubApiFailed',
  'githubApiNotArray',
  'githubApiTimeout',
  'downloadFailed',
  'downloadNoBody',
  'missingUrl',
  'checkReturnedNull',
] as const;

describe('update locale errors', () => {
  it('defines concrete update error messages for every supported locale', () => {
    for (const locale of i18nConfig.supportedLanguages) {
      const messages = locales[`../../src/renderer/services/i18n/locales/${locale}/update.json`];
      expect(messages, `${locale} update locale should exist`).toBeDefined();
      const errors = messages?.errors as Record<string, string> | undefined;
      expect(errors, `${locale} update.errors should exist`).toBeDefined();

      for (const key of REQUIRED_UPDATE_ERROR_KEYS) {
        const message = errors?.[key];
        expect(message, `${locale} update.errors.${key}`).toBeTypeOf('string');
        expect(message, `${locale} update.errors.${key}`).not.toBe(`update.errors.${key}`);
        expect(message?.trim().length, `${locale} update.errors.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
