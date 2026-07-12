import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import HomeStarters from '@/renderer/pages/guid/components/HomeStarters';

const mocks = vi.hoisted(() => ({ blockedPackageId: null as string | null }));

vi.mock('@/renderer/pages/guid/utils/oplHomeAssistants', () => ({
  getOplHomePurposeAssistantIds: () => [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-bookforge',
    'opl-meta-agent',
  ],
  resolveOplPackageLaunchGate: (_appState: unknown, packageId: string) =>
    packageId === mocks.blockedPackageId
      ? {
          launchAllowed: false,
          launchBlockedReason: 'required_export_missing',
          allowedWhenBlocked: ['status', 'doctor', 'repair'],
        }
      : { launchAllowed: true, launchBlockedReason: null, allowedWhenBlocked: [] },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: {} }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      key === 'guid.home.launchBlocked' ? `${options?.reason}: ${options?.actions}` : key,
  }),
}));

const assistant = (id: string): Assistant => ({
  id,
  source: 'builtin',
  name: id.toUpperCase(),
  name_i18n: { 'en-US': id.toUpperCase() },
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  preset_agent_type: 'codex',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
});

describe('HomeStarters', () => {
  beforeEach(() => {
    mocks.blockedPackageId = null;
  });
  it('shows every user-visible App-owned starter and selects one capability', async () => {
    const onSelect = vi.fn();
    render(
      <HomeStarters
        assistants={['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge', 'opl-meta-agent'].map(
          assistant
        )}
        localeKey='en-US'
        onSelect={onSelect}
      />
    );

    expect(screen.getAllByTestId(/^home-starter-/)).toHaveLength(5);
    expect(screen.getByTestId('home-starter-opl-meta-agent')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('home-starter-med-autogrant'));
    expect(onSelect).toHaveBeenCalledWith('med-autogrant');
  });

  it('keeps an active capability visible and clears it from the same starter without selecting another', async () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <HomeStarters
        assistants={['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge', 'opl-meta-agent'].map(
          assistant
        )}
        localeKey='en-US'
        activeCapabilityId='opl-meta-agent'
        onSelect={onSelect}
        onClear={onClear}
      />
    );

    expect(screen.getAllByTestId(/^home-starter-/)).toHaveLength(5);
    const activeStarter = screen.getByTestId('home-starter-opl-meta-agent');
    expect(activeStarter).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(activeStarter);
    expect(onClear).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps an operationally blocked package visible but disables its Home shortcut', async () => {
    mocks.blockedPackageId = 'med-autogrant';
    const onSelect = vi.fn();
    render(
      <HomeStarters
        assistants={['med-autoscience', 'med-autogrant'].map(assistant)}
        localeKey='en-US'
        onSelect={onSelect}
      />
    );

    const blockedStarter = screen.getByTestId('home-starter-med-autogrant');
    expect(blockedStarter).toBeDisabled();
    expect(blockedStarter).toHaveAttribute('title', expect.stringContaining('required_export_missing'));
    await userEvent.click(blockedStarter);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps an active but blocked package disabled instead of reopening its launch path', async () => {
    mocks.blockedPackageId = 'med-autoscience';
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <HomeStarters
        assistants={[assistant('med-autoscience')]}
        localeKey='en-US'
        activeCapabilityId='med-autoscience'
        onSelect={onSelect}
        onClear={onClear}
      />
    );

    const blockedStarter = screen.getByTestId('home-starter-med-autoscience');
    expect(blockedStarter).toBeDisabled();
    expect(blockedStarter).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(blockedStarter);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });
});
