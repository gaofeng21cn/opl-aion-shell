import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const routerState = vi.hoisted(() => ({
  pathname: '/settings/system',
  searchParams: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: routerState.pathname }),
  useSearchParams: () => [routerState.searchParams, routerState.setSearchParams],
}));

vi.mock('@arco-design/web-react', async () => {
  const React = await import('react');
  const Tabs = Object.assign(
    ({
      activeTab,
      children,
      onChange,
    }: {
      activeTab?: string;
      children: React.ReactNode;
      onChange?: (key: string) => void;
    }) => {
      const panes = React.Children.toArray(children).filter(
        (child): child is React.ReactElement<{ title?: React.ReactNode; children?: React.ReactNode }> =>
          React.isValidElement(child)
      );
      const selectedKey = activeTab ?? String(panes[0]?.key ?? '');
      return (
        <div>
          <div>
            {panes.map((pane) => {
              const key = String(pane.key).replace(/^\.\$/, '');
              return (
                <button key={key} type='button' onClick={() => onChange?.(key)}>
                  {pane.props.title}
                </button>
              );
            })}
          </div>
          <div>
            {panes.find((pane) => String(pane.key).replace(/^\.\$/, '') === selectedKey)?.props.children ?? null}
          </div>
        </div>
      );
    },
    { TabPane: ({ children }: { children?: React.ReactNode }) => <>{children}</> }
  );
  return { Tabs };
});

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='access-webui-content' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='capabilities-tools-content' />,
}));

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: () => <div data-testid='capabilities-skills-content' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-settings-content' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-settings-content' />,
}));

import AccessSettings from '@/renderer/pages/settings/sections/AccessSettings';
import CapabilitiesSettings from '@/renderer/pages/settings/CapabilitiesSettings';
import SystemSettings from '@/renderer/pages/settings/SystemSettings';
import {
  BUILTIN_TAB_IDS,
  SETTINGS_DEFAULT_ROUTE,
  SETTINGS_ROUTE_PATHS,
} from '@/renderer/pages/settings/sections/settingsNav';

describe('settings page shells', () => {
  beforeEach(() => {
    routerState.pathname = '/settings/system';
    routerState.searchParams = new URLSearchParams();
    routerState.setSearchParams.mockClear();
  });

  it('keeps every builtin settings tab mapped to an openable route', () => {
    expect(SETTINGS_DEFAULT_ROUTE).toBe('/settings/overview');
    expect(BUILTIN_TAB_IDS).toEqual(['overview', 'runtime', 'capabilities', 'access', 'appearance', 'system', 'about']);
    expect(Object.keys(SETTINGS_ROUTE_PATHS)).toEqual([...BUILTIN_TAB_IDS]);
    expect(Object.values(SETTINGS_ROUTE_PATHS)).toEqual([
      '/settings/overview',
      '/settings/runtime',
      '/settings/capabilities',
      '/settings/access',
      '/settings/appearance',
      '/settings/system',
      '/settings/about',
    ]);
  });

  it('opens the Access settings section without requiring the modal host', () => {
    render(<AccessSettings />);

    expect(screen.getByTestId('settings-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('access-webui-content')).toBeInTheDocument();
  });

  it('opens both Capabilities tabs and preserves search params on tab change', () => {
    render(<CapabilitiesSettings />);

    expect(screen.getByTestId('capabilities-skills-content')).toBeInTheDocument();

    fireEvent.click(screen.getByText('MCP & Voice'));

    expect(screen.getByTestId('capabilities-tools-content')).toBeInTheDocument();
    expect(routerState.setSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: true });
    const [nextParams] = routerState.setSearchParams.mock.calls.at(-1) ?? [];
    expect(nextParams?.get('tab')).toBe('tools');
  });

  it('opens System and About through the shared settings page wrapper', () => {
    routerState.pathname = '/settings/system';
    const { rerender } = render(<SystemSettings />);

    expect(screen.getByTestId('system-settings-content')).toBeInTheDocument();

    routerState.pathname = '/settings/about';
    rerender(<SystemSettings />);

    expect(screen.getByTestId('about-settings-content')).toBeInTheDocument();
  });
});
