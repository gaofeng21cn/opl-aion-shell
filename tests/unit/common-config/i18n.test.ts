import { describe, expect, it } from 'vitest';
import { isSameLanguageCode, resolveInitialLanguage } from '@/common/config/i18n';

describe('resolveInitialLanguage', () => {
  it('uses the OS locale for a fresh desktop profile', () => {
    expect(resolveInitialLanguage({ systemLanguage: 'zh-Hans-CN' })).toBe('zh-CN');
  });

  it('preserves a stored user preference when the OS locale differs', () => {
    expect(resolveInitialLanguage({ storedLanguage: 'en-US', systemLanguage: 'zh-CN' })).toBe('en-US');
  });

  it('prefers the Electron main-process hint over a stale renderer cache', () => {
    expect(
      resolveInitialLanguage({
        storedLanguage: 'en-US',
        injectedLanguage: 'zh-CN',
        systemLanguage: 'en-US',
        preferInjected: true,
      })
    ).toBe('zh-CN');
  });

  it('keeps a backend preference authoritative over the startup mirror', () => {
    expect(
      resolveInitialLanguage({
        storedLanguage: 'en-US',
        injectedLanguage: 'zh-CN',
        systemLanguage: 'zh-CN',
      })
    ).toBe('en-US');
  });

  it('falls back to the supported default for an unsupported OS locale', () => {
    expect(resolveInitialLanguage({ systemLanguage: 'ja-JP' })).toBe('en-US');
  });

  it('treats normalized aliases as the same language', () => {
    expect(isSameLanguageCode('zh-Hans-CN', 'zh-CN')).toBe(true);
    expect(isSameLanguageCode('en-GB', 'en-US')).toBe(true);
    expect(isSameLanguageCode('zh-CN', 'en-US')).toBe(false);
  });
});
