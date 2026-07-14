import { describe, expect, it } from 'vitest';
import { resolveInitialLanguage } from '@/common/config/i18n';

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

  it('falls back to the supported default for an unsupported OS locale', () => {
    expect(resolveInitialLanguage({ systemLanguage: 'ja-JP' })).toBe('en-US');
  });
});
