import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { resolveSettingsReturnPath } from '@/renderer/utils/ui/settingsReturnPath';

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
  isMobile: false,
  navigationHistory: null as null | {
    back: ReturnType<typeof vi.fn>;
    forward: ReturnType<typeof vi.fn>;
    canBack: boolean;
    canForward: boolean;
  },
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid='location-probe'>{`${location.pathname}${location.search}${location.hash}`}</div>;
};

vi.mock('@/common', () => ({
  ipcBridge: {
    team: { get: { invoke: vi.fn().mockResolvedValue(null) } },
    conversation: { get: { invoke: vi.fn().mockResolvedValue({ name: 'Task' }) } },
  },
}));

vi.mock('@/common/config/oplProductProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/oplProductProfile')>();
  return {
    ...actual,
    getOplOrdinaryChromeName: () => 'One Person Lab',
    getOplGlobalFeedbackIssueUrl: () => 'https://github.com/gaofeng21cn/one-person-lab-app/issues/new',
  };
});

vi.mock('@/renderer/components/layout/Titlebar/MobileConversationBrand', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mocks.isMobile }),
}));

vi.mock('@/renderer/hooks/context/NavigationHistoryContext', () => ({
  useNavigationHistory: () => mocks.navigationHistory,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
  isMacOS: () => false,
  openExternalUrl: mocks.openExternalUrl,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      ({
        'settings.githubIssue.tooltip': 'Report an OPL App issue on GitHub',
        'settings.githubIssue.title': 'OPL App feedback',
        'settings.githubIssue.body': `Describe the issue.\n\nCurrent page: ${options?.route}\nApp version: ${options?.version}`,
        'settings.backToApp': 'Back to app',
      })[key] ?? key,
  }),
}));

describe('Titlebar OPL App feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile = false;
    mocks.navigationHistory = null;
    sessionStorage.clear();
    mocks.openExternalUrl.mockResolvedValue(undefined);
  });

  it('uses the Font Awesome Free Regular circle-question icon', () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Titlebar workspaceAvailable={false} />
      </MemoryRouter>
    );

    const icon = screen.getByTestId('app-titlebar-help-icon');
    expect(icon).toHaveAttribute('data-prefix', 'far');
    expect(icon).toHaveAttribute('data-icon', 'circle-question');
  });

  it('opens a prefilled OPL App GitHub issue with the current route and release version', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/access?section=gateway']}>
        <Titlebar workspaceAvailable={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Report an OPL App issue on GitHub' }));

    await waitFor(() => expect(mocks.openExternalUrl).toHaveBeenCalledOnce());
    const issueUrl = new URL(mocks.openExternalUrl.mock.calls[0][0]);
    expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new'
    );
    expect(issueUrl.searchParams.get('title')).toBe('OPL App feedback');
    expect(issueUrl.searchParams.get('body')).toContain('Current page: /settings/access?section=gateway');
    expect(issueUrl.searchParams.get('body')).toContain('App version: 26.5.27');
  });

  it('reports an external-open failure without breaking the titlebar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.openExternalUrl.mockRejectedValueOnce(new Error('open failed'));
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Titlebar workspaceAvailable={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Report an OPL App issue on GitHub' }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to open OPL App issue:', expect.any(Error)));
    consoleError.mockRestore();
  });

  it('uses the shared return resolver in the narrow Settings titlebar', async () => {
    mocks.isMobile = true;
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/thread-7?mode=review#diff');
    render(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <Titlebar workspaceAvailable={false} />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('settings-titlebar-back-to-app'));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/conversation/thread-7?mode=review#diff')
    );
  });

  it('uses the existing top titlebar history control on desktop Settings', () => {
    const back = vi.fn();
    mocks.navigationHistory = {
      back,
      forward: vi.fn(),
      canBack: true,
      canForward: false,
    };
    render(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <Titlebar workspaceAvailable={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('settings-titlebar-history-back'));
    expect(back).toHaveBeenCalledOnce();
  });

  it('falls back to Home for invalid or Settings-internal stored return paths', () => {
    sessionStorage.setItem('aion:last-non-settings-path', '//example.com/settings');
    expect(resolveSettingsReturnPath()).toBe('/guid');
    sessionStorage.setItem('aion:last-non-settings-path', '/settings/access?section=gateway');
    expect(resolveSettingsReturnPath()).toBe('/guid');
    sessionStorage.setItem('aion:last-non-settings-path', `/conversation/${String.fromCharCode(0)}thread`);
    expect(resolveSettingsReturnPath()).toBe('/guid');
  });
});
