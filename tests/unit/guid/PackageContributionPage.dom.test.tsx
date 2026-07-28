import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PackageContributionPage from '@/renderer/pages/guid/PackageContributionPage';

const mocks = vi.hoisted(() => ({
  appState: { value: {} as Record<string, unknown> },
  navigate: vi.fn(),
  packageId: { value: 'future.carrier.package' },
  navigationId: { value: 'future.activity' },
  runPackageContribution: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      runPackageContribution: { invoke: mocks.runPackageContribution },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState.value }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ packageId: mocks.packageId.value, navigationId: mocks.navigationId.value }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.back': 'Back',
        'common.refresh': 'Refresh',
        'common.loading': 'Loading',
        'common.error': 'Error',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.runtime.snapshotUnavailable': 'Unavailable',
        'common.runtime.snapshotUnavailableDescription': 'This Package view is unavailable.',
      })[key] ?? key,
    i18n: { language: 'en-US' },
  }),
}));

function contributionState() {
  return {
    agent_packages: {
      directory: {
        entries: [
          {
            package_id: 'future.carrier.package',
            package_role: 'future_role',
            installed: true,
            app_contributions: {
              schema_version: 'opl-app-contributions.v1',
              navigation: [
                {
                  navigation_id: 'future.activity',
                  label_i18n: { 'en-US': 'Future activity' },
                  view_id: 'future.activity.view',
                },
              ],
              views: [
                {
                  view_id: 'future.activity.view',
                  view_type: 'activity_log',
                  title_i18n: { 'en-US': 'Future activity' },
                  data_ref: 'future.data.v1#recent',
                  command_ids: ['future.refresh', 'future.publish'],
                },
              ],
              commands: [
                {
                  command_id: 'future.refresh',
                  label_i18n: { 'en-US': 'Refresh future' },
                  action_ref: 'future.data.v1#refresh',
                },
                {
                  command_id: 'future.publish',
                  label_i18n: { 'en-US': 'Publish future' },
                  action_ref: 'future.data.v1#publish',
                  confirmation_required: true,
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function response(ref: string, operation: 'read' | 'execute', result: unknown) {
  return {
    ok: true,
    command: 'opl app contribution',
    parsed: {
      opl_app_contribution: {
        response: {
          ok: true,
          ref,
          operation,
          result,
        },
      },
    },
  };
}

describe('PackageContributionPage', () => {
  beforeEach(() => {
    mocks.appState.value = contributionState();
    mocks.navigate.mockReset();
    mocks.runPackageContribution.mockReset();
    mocks.runPackageContribution.mockResolvedValue(
      response('future.data.v1#recent', 'read', { count: 2, entries: ['one'] })
    );
  });

  it('reads and renders an unknown descriptor contribution through the generic bridge', async () => {
    render(<PackageContributionPage />);

    await waitFor(() =>
      expect(mocks.runPackageContribution).toHaveBeenCalledWith({
        packageId: 'future.carrier.package',
        ref: 'future.data.v1#recent',
        operation: 'read',
      })
    );
    expect(await screen.findByTestId('opl-package-contribution-result')).toHaveTextContent('one');
    expect(screen.getByTestId('opl-package-contribution-page')).toHaveTextContent('Future activity');
  });

  it('executes a non-confirming owner command without inventing a confirmation flag', async () => {
    mocks.runPackageContribution
      .mockResolvedValueOnce(response('future.data.v1#recent', 'read', { count: 2 }))
      .mockResolvedValueOnce(response('future.data.v1#refresh', 'execute', { refreshed: true }))
      .mockResolvedValueOnce(response('future.data.v1#recent', 'read', { count: 3 }));
    render(<PackageContributionPage />);

    await screen.findByTestId('opl-package-contribution-result');
    await userEvent.click(screen.getByTestId('opl-package-contribution-command-future.refresh'));
    await waitFor(() =>
      expect(mocks.runPackageContribution).toHaveBeenCalledWith({
        packageId: 'future.carrier.package',
        ref: 'future.data.v1#refresh',
        operation: 'execute',
        confirmed: false,
      })
    );
  });

  it('keeps a descriptor-confirmed owner command behind the existing confirm dialog', async () => {
    const confirm = vi
      .spyOn((await import('@arco-design/web-react')).Modal, 'confirm')
      .mockImplementation(() => undefined as never);
    render(<PackageContributionPage />);

    await screen.findByTestId('opl-package-contribution-result');
    await userEvent.click(screen.getByTestId('opl-package-contribution-command-future.publish'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Publish future' }));
    expect(mocks.runPackageContribution).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
