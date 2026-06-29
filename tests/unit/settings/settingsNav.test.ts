import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_TAB_IDS,
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  getBuiltinSettingsNavItems,
} from '@/renderer/pages/settings/sections/settingsNav';

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsVisibleTabs: () => [
    'general',
    'access',
    'capabilities',
    'environment',
    'appearance',
    'advanced',
    'about',
  ],
  getOplGuiLegacySettingsRouteRedirects: () => ({
    overview: 'general',
    runtime: 'environment',
    system: 'advanced',
    model: 'environment',
    agent: 'capabilities',
    assistants: 'capabilities',
    'skills-hub': 'capabilities',
    tools: 'capabilities',
    display: 'appearance',
    webui: 'access',
    pet: 'appearance',
  }),
}));

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

describe('settingsNav App-owned tabs', () => {
  it('exposes the ordinary Settings tabs in App product order', () => {
    expect(BUILTIN_TAB_IDS).toEqual(['general', 'access', 'capabilities', 'environment', 'appearance', 'advanced']);
    expect(SETTINGS_DEFAULT_ROUTE).toBe('/settings/general');
    expect(getBuiltinSettingsNavItems(true, t).map((item) => item.label)).toEqual([
      'Overview',
      'Get Started',
      'Capabilities',
      'Maintenance',
      'Preferences',
      'Advanced',
    ]);
  });

  it('redirects legacy settings routes to App-owned settings pages', () => {
    expect(LEGACY_SETTINGS_ROUTE_REDIRECTS).toEqual({
      overview: '/settings/general',
      runtime: '/settings/environment',
      system: '/settings/advanced',
      model: '/settings/environment',
      agent: '/settings/capabilities',
      assistants: '/settings/capabilities',
      'skills-hub': '/settings/capabilities?tab=skills',
      tools: '/settings/capabilities?tab=tools',
      display: '/settings/appearance',
      webui: '/settings/access',
      pet: '/settings/appearance',
      about: '/settings/about',
    });
  });
});
