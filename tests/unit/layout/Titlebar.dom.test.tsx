import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Titlebar from '@/renderer/components/layout/Titlebar';

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: { get: { invoke: vi.fn() } },
    conversation: { get: { invoke: vi.fn() } },
  },
}));

vi.mock('@/common/config/oplProductProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/config/oplProductProfile')>();
  return {
    ...actual,
    getOplOrdinaryChromeName: () => 'One Person Lab',
  };
});

vi.mock('@/renderer/components/layout/MobileConversationBrand', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/context/NavigationHistoryContext', () => ({
  useNavigationHistory: () => null,
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
      })[key] ?? key,
  }),
}));

describe('Titlebar OPL App feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openExternalUrl.mockResolvedValue(undefined);
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
});
