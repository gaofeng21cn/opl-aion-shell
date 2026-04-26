/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { app } from 'electron';
import { ProcessConfig } from '@process/utils/initStorage';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  resolveInitialLanguage,
  mergeWithFallback,
  ensureAndSwitch,
  type SupportedLanguage,
  type LocaleData,
} from '@/common/config/i18n';

// Static imports – Vite bundles these into the main-process output so they
// work correctly in both development and production (no fs.readFile needed).
import enUS from '@renderer/services/i18n/locales/en-US/index';
import zhCN from '@renderer/services/i18n/locales/zh-CN/index';
import jaJP from '@renderer/services/i18n/locales/ja-JP/index';
import zhTW from '@renderer/services/i18n/locales/zh-TW/index';
import koKR from '@renderer/services/i18n/locales/ko-KR/index';
import trTR from '@renderer/services/i18n/locales/tr-TR/index';
import ruRU from '@renderer/services/i18n/locales/ru-RU/index';
import ukUA from '@renderer/services/i18n/locales/uk-UA/index';

// All locale data keyed by language code.
// NOTE: When adding a new language, add a static import above and an entry here.
// These MUST be static imports (not dynamic) because the main process is bundled
// by Vite and the JSON files won't exist on disk in production.
const localeData: LocaleData = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
  'ko-KR': koKR,
  'tr-TR': trTR,
  'ru-RU': ruRU,
  'uk-UA': ukUA,
};

const fallbackData = localeData[DEFAULT_LANGUAGE] ?? {};

function getLocaleModules(locale: string): Record<string, unknown> {
  const normalized = normalizeLanguageCode(locale);
  const data = localeData[normalized];
  if (!data) return fallbackData;
  if (normalized === DEFAULT_LANGUAGE) return data;
  return mergeWithFallback(fallbackData, data);
}

function getElectronSystemLanguages(): string[] {
  const preferredLanguages =
    typeof app.getPreferredSystemLanguages === 'function' ? app.getPreferredSystemLanguages() : [];
  return [...preferredLanguages, app.getLocale()].filter((language): language is string => Boolean(language));
}

function resolveProcessLanguage(savedLanguage?: string | null): SupportedLanguage {
  return resolveInitialLanguage({
    savedLanguage,
    systemLanguages: getElectronSystemLanguages(),
  });
}

/** Resolves when i18n is fully initialized with the user's language */
export const i18nReady = (async (): Promise<void> => {
  await i18n.init({
    resources: {
      [DEFAULT_LANGUAGE]: { translation: getLocaleModules(DEFAULT_LANGUAGE) },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
  });

  const language = await ProcessConfig.get('language');
  await ensureAndSwitch(i18n, resolveProcessLanguage(language), getLocaleModules);
})().catch((error) => {
  console.error('[Main Process] Failed to initialize i18n:', error);
});

/**
 * Set initial language (called after storage is ready)
 */
export async function setInitialLanguage(language: string | undefined): Promise<SupportedLanguage> {
  await i18nReady;
  const resolvedLanguage = resolveProcessLanguage(language);
  await ensureAndSwitch(i18n, resolvedLanguage, getLocaleModules);
  return resolvedLanguage;
}

/**
 * Change language
 */
export async function changeLanguage(language: string): Promise<void> {
  await i18nReady;
  await ensureAndSwitch(i18n, language, getLocaleModules);
}

export { normalizeLanguageCode };
export default i18n;
