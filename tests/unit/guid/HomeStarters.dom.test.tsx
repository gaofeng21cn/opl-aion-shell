import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import HomeStarters from '@/renderer/pages/guid/components/HomeStarters';

const mocks = vi.hoisted(() => ({
  appState: {} as Record<string, unknown>,
  packageIds: ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge', 'opl-meta-agent'],
}));

const readyAppState = () => ({
  agent_packages: {
    status_index: {
      packages: Object.fromEntries(
        mocks.packageIds.map((packageId) => [
          packageId,
          {
            package_id: packageId,
            operational_ready: true,
            launch_allowed: true,
            launch_blocked_reason: null,
            allowed_when_blocked: ['status', 'doctor', 'repair'],
          },
        ])
      ),
    },
  },
});

vi.mock('@/renderer/pages/guid/utils/oplHomeAssistants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pages/guid/utils/oplHomeAssistants')>();
  return {
    ...actual,
    getOplHomePurposeAssistantIds: () => mocks.packageIds,
  };
});

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState }),
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
    mocks.appState = readyAppState();
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
    const appState = readyAppState();
    appState.agent_packages.status_index.packages['med-autogrant'] = {
      package_id: 'med-autogrant',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'required_export_missing',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    };
    mocks.appState = appState;
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

  it('disables a canonical Home shortcut when its package status entry is missing', async () => {
    const appState = readyAppState();
    delete appState.agent_packages.status_index.packages['med-autogrant'];
    mocks.appState = appState;
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
    expect(blockedStarter).toHaveAttribute('title', expect.stringContaining('package_not_installed'));
    await userEvent.click(blockedStarter);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
