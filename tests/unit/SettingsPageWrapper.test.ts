import { describe, it, expect } from 'vitest';
import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';

const t = (key: string, options?: { defaultValue?: string }) => {
  const labels: Record<string, string> = {
    'settings.overview': 'Overview',
    'settings.runtime': 'Runtime',
    'settings.capabilities': 'Capabilities',
    'settings.access': 'Access',
    'settings.appearance': 'Appearance',
    'settings.system': 'System',
    'settings.about': 'About',
  };

  return labels[key] ?? options?.defaultValue ?? key;
};

describe('getBuiltinSettingsNavItems', () => {
  it('returns mobile settings tabs in the same order as desktop sider', () => {
    const items = getBuiltinSettingsNavItems(false, t);

    expect(items.map((item) => item.id)).toEqual([
      'overview',
      'runtime',
      'capabilities',
      'access',
      'appearance',
      'system',
      'about',
    ]);

    expect(items.map((item) => item.label)).toEqual([
      'Overview',
      'Runtime',
      'Capabilities',
      'Access',
      'Appearance',
      'System',
      'About',
    ]);
  });

  it('keeps the access route stable for mobile and desktop nav variants', () => {
    expect(getBuiltinSettingsNavItems(false, t).find((item) => item.id === 'access')?.path).toBe('access');
    expect(getBuiltinSettingsNavItems(true, t).find((item) => item.id === 'access')?.path).toBe('access');
  });
});
