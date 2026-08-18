import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PackageContributionNavigation from '@/renderer/pages/guid/components/PackageContributionNavigation';
import type { OplHomeAppContribution } from '@/renderer/pages/guid/utils/oplHomeAssistants';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const contribution = (
  packageId: string,
  navigationId: string,
  label: string,
  iconId: string | null = null
): OplHomeAppContribution => ({
  package_id: packageId,
  navigation_id: navigationId,
  label_i18n: { 'en-US': label },
  view_id: `${navigationId}.view`,
  icon_id: iconId,
  installed: true,
  sort_order: null,
  view: {
    viewId: `${navigationId}.view`,
    viewType: 'activity_log',
    titleI18n: { 'en-US': label },
    dataRef: `${packageId}.data#recent`,
  },
  commands: [],
  badges: [],
});

describe('PackageContributionNavigation', () => {
  it('renders a descriptor DSH icon and falls back to agent for an unavailable glyph', () => {
    render(
      <PackageContributionNavigation
        contributions={[
          contribution('opl-relay', 'relay.inbox', 'Inbox', 'send'),
          contribution('future.carrier.package', 'future.activity', 'Future activity', 'research'),
        ]}
        localeKey='en-US'
        onOpen={vi.fn()}
      />
    );

    expect(
      screen.getByTestId('opl-package-contribution-navigation-opl-relay-relay.inbox').querySelector('[data-opl-icon]')
    ).toHaveAttribute('data-opl-icon', 'send');
    expect(
      screen
        .getByTestId('opl-package-contribution-navigation-future.carrier.package-future.activity')
        .querySelector('[data-opl-icon]')
    ).toHaveAttribute('data-opl-icon', 'agent');
  });

  it('renders arbitrary descriptor-projected Packages without a Package id allowlist', async () => {
    const onOpen = vi.fn();
    const future = contribution('future.carrier.package', 'future.activity', 'Future activity');
    render(
      <PackageContributionNavigation
        contributions={[contribution('opl-relay', 'relay.inbox', 'Inbox'), future]}
        localeKey='en-US'
        onOpen={onOpen}
      />
    );

    const futureEntry = screen.getByTestId(
      'opl-package-contribution-navigation-future.carrier.package-future.activity'
    );
    expect(futureEntry).toHaveTextContent('Future activity');
    expect(futureEntry).toHaveAttribute('data-opl-package-id', 'future.carrier.package');

    await userEvent.click(futureEntry);
    expect(onOpen).toHaveBeenCalledWith(future);
  });
});
