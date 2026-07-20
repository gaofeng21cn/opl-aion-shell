import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import HomeStarters from '@/renderer/pages/guid/components/HomeStarters';
import PresetAgentTag from '@/renderer/pages/guid/components/PresetAgentTag';

const mocks = vi.hoisted(() => ({
  appState: {} as Record<string, unknown>,
  packageIds: ['mas', 'rca', 'mag', 'obf', 'oma'],
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
    render(<HomeStarters assistants={mocks.packageIds.map(assistant)} localeKey='en-US' onSelect={onSelect} />);

    expect(screen.getAllByTestId(/^home-starter-/)).toHaveLength(5);
    expect(screen.getAllByTestId(/^home-starter-/).map((item) => item.dataset.testid)).toEqual([
      'home-starter-mas',
      'home-starter-rca',
      'home-starter-mag',
      'home-starter-obf',
      'home-starter-oma',
    ]);
    expect(screen.getByTestId('home-starter-oma')).toBeInTheDocument();
    expect(screen.getByTestId('starter-icon-mas').querySelector('svg')).not.toBeNull();
    expect(screen.queryByTestId('starter-next-mag')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-starter-mag')).toHaveAttribute('data-opl-launch-ready', 'true');

    await userEvent.click(screen.getByTestId('home-starter-mag'));
    expect(onSelect).toHaveBeenCalledWith('mag');
  });

  it('keeps an active capability visible and clears it from the same starter without selecting another', async () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(
      <HomeStarters
        assistants={['mas', 'mag', 'rca', 'obf', 'oma'].map(assistant)}
        localeKey='en-US'
        activeCapabilityId='oma'
        onSelect={onSelect}
        onClear={onClear}
      />
    );

    expect(screen.getAllByTestId(/^home-starter-/)).toHaveLength(5);
    const activeStarter = screen.getByTestId('home-starter-oma');
    expect(activeStarter).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(activeStarter);
    expect(onClear).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses the quiet active state without adding a trailing check icon', () => {
    render(
      <HomeStarters
        assistants={['mas', 'mag', 'rca', 'obf', 'oma'].map(assistant)}
        localeKey='en-US'
        activeCapabilityId='oma'
        onSelect={vi.fn()}
      />
    );

    const activeStarter = screen.getByTestId('home-starter-oma');
    expect(activeStarter).toHaveAttribute('data-opl-active', 'true');
    expect(activeStarter.className).toContain('homeStarterActive');
    expect(activeStarter).not.toHaveClass('!border-primary-5', '!bg-primary-1', '!text-primary-6');
    expect(screen.getByTestId('starter-icon-oma').className).toContain('homeStarterIcon');
    expect(screen.queryByTestId('starter-active-check')).not.toBeInTheDocument();
    expect(screen.queryByTestId('starter-next-oma')).not.toBeInTheDocument();
  });

  it('keeps an explicitly unavailable package selectable and defers its typed gate to send', async () => {
    const appState = readyAppState();
    appState.agent_packages.status_index.packages.mag = {
      package_id: 'mag',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'required_export_missing',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    };
    mocks.appState = appState;
    const onSelect = vi.fn();
    render(<HomeStarters assistants={['mas', 'mag'].map(assistant)} localeKey='en-US' onSelect={onSelect} />);

    const blockedStarter = screen.getByTestId('home-starter-mag');
    expect(blockedStarter).not.toBeDisabled();
    expect(blockedStarter).toHaveAttribute('data-opl-launch-ready', 'false');
    expect(blockedStarter).toHaveAttribute('title', expect.stringContaining('required_export_missing'));
    await userEvent.click(blockedStarter);
    expect(onSelect).toHaveBeenCalledWith('mag');
  });

  it('keeps a scope-materialization package selectable while Stage runtime owns activation', async () => {
    const appState = readyAppState();
    appState.agent_packages.status_index.packages.mas = {
      package_id: 'mas',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'scope_materialization_missing',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    };
    mocks.appState = appState;
    const onSelect = vi.fn();
    render(<HomeStarters assistants={[assistant('mas')]} localeKey='en-US' onSelect={onSelect} />);

    const activationStarter = screen.getByTestId('home-starter-mas');
    expect(activationStarter).not.toBeDisabled();
    expect(activationStarter).toHaveAttribute('aria-pressed', 'false');
    expect(activationStarter).toHaveAttribute('data-opl-launch-ready', 'true');
    await userEvent.click(activationStarter);
    expect(onSelect).toHaveBeenCalledWith('mas');
  });

  it('does not expose stale status diagnostics when directory readiness allows launch', () => {
    mocks.appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'mas',
              readiness: {
                status: 'ready',
                operational_ready: true,
                launch_allowed: true,
                reason: 'use_boundary_reconciliation_ready',
              },
            },
          ],
        },
        status_index: {
          packages: {
            mas: {
              package_id: 'mas',
              operational_ready: false,
              launch_allowed: false,
              launch_blocked_reason: null,
              allowed_when_blocked: ['status', 'doctor', 'repair'],
            },
          },
        },
      },
    };

    render(<HomeStarters assistants={[assistant('mas')]} localeKey='en-US' onSelect={vi.fn()} />);

    const starter = screen.getByTestId('home-starter-mas');
    expect(starter).toHaveAttribute('data-opl-launch-ready', 'true');
    expect(starter).not.toHaveAttribute('title');
  });

  it('keeps package_unavailable selectable for recovery while marking the send gate', async () => {
    const appState = readyAppState();
    appState.agent_packages.status_index.packages.mag = {
      package_id: 'mag',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'package_not_installed',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    };
    mocks.appState = appState;
    const onSelect = vi.fn();
    render(<HomeStarters assistants={[assistant('mag')]} localeKey='en-US' onSelect={onSelect} />);

    const unavailableStarter = screen.getByTestId('home-starter-mag');
    expect(unavailableStarter).not.toBeDisabled();
    expect(unavailableStarter).toHaveAttribute('data-opl-launch-ready', 'false');
    expect(unavailableStarter).toHaveAttribute('title', expect.stringContaining('package_not_installed'));
    await userEvent.click(unavailableStarter);
    expect(onSelect).toHaveBeenCalledWith('mag');
  });

  it('keeps starters selectable while package state is still loading', async () => {
    mocks.appState = {};
    const onSelect = vi.fn();
    render(<HomeStarters assistants={[assistant('oma')]} localeKey='en-US' onSelect={onSelect} />);

    const starter = screen.getByTestId('home-starter-oma');
    expect(starter).not.toBeDisabled();
    await userEvent.click(starter);
    expect(onSelect).toHaveBeenCalledWith('oma');
  });
});

describe('PresetAgentTag agent switcher', () => {
  it('supports keyboard opening and selection without adding button chrome', async () => {
    const user = userEvent.setup();
    const onAgentSwitch = vi.fn();

    render(
      <PresetAgentTag
        agentInfo={{ agent_type: 'codex', name: 'Codex', custom_agent_id: 'codex' }}
        assistants={[assistant('codex')]}
        localeKey='en-US'
        onClose={vi.fn()}
        agentSwitcherItems={[
          { key: 'codex', label: 'Codex', isCurrent: true },
          { key: 'research', label: 'Research', isCurrent: false },
        ]}
        onAgentSwitch={onAgentSwitch}
      />
    );

    const trigger = screen.getByTestId('preset-agent-switcher-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('border-0', 'bg-transparent', 'appearance-none');
    expect(trigger).not.toHaveClass('arco-btn');
    expect(trigger).not.toHaveAttribute('style');

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));

    const menu = await screen.findByRole('menu');
    const researchItem = within(menu).getByRole('menuitem', { name: 'Research' });
    researchItem.focus();
    fireEvent.keyDown(researchItem, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(onAgentSwitch).toHaveBeenCalledWith('research');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveFocus();

    await user.keyboard(' ');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    await user.keyboard(' ');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  });
});
