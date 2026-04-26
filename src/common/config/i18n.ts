/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared i18n utility functions used by both main process and renderer.
 */

import i18nConfig from '@/common/config/i18n-config.json';

export const SUPPORTED_LANGUAGES = i18nConfig.supportedLanguages;
export const DEFAULT_LANGUAGE = i18nConfig.fallbackLanguage;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function tryNormalizeLanguageCode(language: string | null | undefined): SupportedLanguage | undefined {
  const trimmed = language?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/_/g, '-');
  const exactMatch = SUPPORTED_LANGUAGES.find((supported) => supported.toLowerCase() === normalized.toLowerCase());
  if (exactMatch) {
    return exactMatch as SupportedLanguage;
  }

  const langOnly = normalized.toLowerCase().split('-')[0];
  switch (langOnly) {
    case 'en':
      return 'en-US';
    case 'zh':
      return 'zh-CN';
    case 'ja':
      return 'ja-JP';
    case 'ko':
      return 'ko-KR';
    case 'tr':
      return 'tr-TR';
    case 'ru':
      return 'ru-RU';
    case 'uk':
      return 'uk-UA';
    default:
      return undefined;
  }
}

/**
 * Normalize a language code to a supported BCP 47 tag.
 * e.g. 'zh' → 'zh-CN', 'ja_JP' → 'ja-JP'
 */
export function normalizeLanguageCode(language: string): SupportedLanguage {
  return tryNormalizeLanguageCode(language) ?? DEFAULT_LANGUAGE;
}

export function resolveInitialLanguage(input: {
  savedLanguage?: string | null;
  systemLanguages?: Array<string | null | undefined>;
  fallbackLanguage?: string | null;
}): SupportedLanguage {
  const savedLanguage = tryNormalizeLanguageCode(input.savedLanguage);
  if (savedLanguage) return savedLanguage;

  for (const language of input.systemLanguages ?? []) {
    const normalized = tryNormalizeLanguageCode(language);
    if (normalized) return normalized;
  }

  return normalizeLanguageCode(input.fallbackLanguage || DEFAULT_LANGUAGE);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `target` into `fallback`, so that any key missing in `target`
 * falls back to the value in `fallback`.
 */
export function mergeWithFallback(
  fallback: Record<string, unknown>,
  target: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fallback };

  for (const [key, value] of Object.entries(target)) {
    const fallbackValue = merged[key];
    if (isPlainObject(fallbackValue) && isPlainObject(value)) {
      merged[key] = mergeWithFallback(fallbackValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

export type LocaleData = Record<string, Record<string, unknown>>;

/**
 * Ensure a resource bundle is loaded, then switch i18next to the given language.
 * Deduplicates the "load-if-missing + changeLanguage" pattern.
 */
export async function ensureAndSwitch(
  i18n: {
    hasResourceBundle: (lng: string, ns: string) => boolean;
    addResourceBundle: (...args: unknown[]) => void;
    changeLanguage: (lng: string) => Promise<unknown>;
  },
  lang: string,
  getTranslation: (locale: string) => Record<string, unknown> | Promise<Record<string, unknown>>
): Promise<void> {
  const normalizedLang = normalizeLanguageCode(lang);
  if (!i18n.hasResourceBundle(normalizedLang, 'translation')) {
    const translation = await getTranslation(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
  }
  await i18n.changeLanguage(normalizedLang);
}
