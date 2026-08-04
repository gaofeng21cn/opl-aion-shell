import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const localesDir = path.join(repoRoot, 'packages/desktop/src/renderer/services/i18n/locales');

function loadBackendStartup(locale: 'en-US' | 'zh-CN'): Record<string, Record<string, string>> {
  const common = JSON.parse(readFileSync(path.join(localesDir, locale, 'common.json'), 'utf8')) as {
    backendStartup: Record<string, Record<string, string>>;
  };
  return common.backendStartup;
}

describe('backend startup copy', () => {
  it.each(['en-US', 'zh-CN'] as const)('%s defines pending and exited copy', (locale) => {
    const startup = loadBackendStartup(locale);
    expect(startup.pendingSlow.title).toBeTruthy();
    expect(startup.pendingSlow.description).toBeTruthy();
    expect(startup.exited.title).toBeTruthy();
    expect(startup.exited.description).toBeTruthy();
    expect(startup.exited.action).toBeTruthy();
  });

  it('does not tell a slow or exited backend to reinstall or inspect antivirus', () => {
    const forbidden = ['reinstall', 'antivirus', 'quarantine', '重新安装', '重装', '杀毒软件', '隔离'];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const startup = loadBackendStartup(locale);
      const text =
        `${startup.pendingSlow.description}\n${startup.exited.description}\n${startup.exited.action}`.toLowerCase();
      for (const phrase of forbidden) {
        expect(text).not.toContain(phrase.toLowerCase());
      }
    }
  });
});
