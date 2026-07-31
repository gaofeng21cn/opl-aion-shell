import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillsHubSettings component (SK3 in N4a).
 * Shallow verification: module import + basic structure.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

const i18nMock = vi.hoisted(() => ({
  t: (k: string, options?: { defaultValue?: string }) => options?.defaultValue ?? k,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: i18nMock.t,
    i18n: { language: 'en' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([
          {
            name: 'med-autoscience',
            description: 'MAS skill',
            location: '/builtin/med-autoscience',
            is_custom: false,
            source: 'builtin',
          },
          {
            name: 'aionui-skills',
            description: 'AionUI implementation helper',
            location: '/builtin/aionui-skills',
            is_custom: false,
            source: 'builtin',
          },
        ]),
      },
      getSkillPaths: {
        invoke: vi.fn().mockResolvedValue({
          user_skills_dir: '/Users/test/.codex/skills',
          builtin_skills_dir: '/Applications/One Person Lab.app/skills',
        }),
      },
      listBuiltinAutoSkills: {
        invoke: vi.fn().mockResolvedValue([{ name: 'aionui-skills', description: 'AionUI implementation helper' }]),
      },
      importSkillWithSymlink: { invoke: vi.fn().mockResolvedValue(undefined) },
      deleteSkill: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

import SkillsHubSettings from '@/renderer/pages/settings/SkillsHubSettings';

describe('SkillsHubSettings', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exports a component (smoke)', () => {
    expect(SkillsHubSettings).toBeDefined();
    expect(typeof SkillsHubSettings).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(SkillsHubSettings.displayName || SkillsHubSettings.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <SkillsHubSettings />;
    expect(element.type).toBe(SkillsHubSettings);
  });

  it('renders the Skill inventory returned by IPC without an App-packaged allowlist', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => {
      expect(screen.getByText('MAS skill')).toBeInTheDocument();
    });

    expect(screen.getAllByText('aionui-skills').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AionUI implementation helper').length).toBeGreaterThan(0);
    const manualImport = screen.getByTestId('btn-manual-import');
    expect(manualImport).toHaveClass('arco-btn');
    expect(manualImport.querySelector('svg')).toBeNull();

    const search = screen.getByRole('textbox', { name: 'Search skills' });
    expect(search).toHaveAttribute('placeholder', 'Search skills...');
    expect(search.closest('.arco-input-inner-wrapper')).not.toBeNull();

    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toHaveClass('arco-btn');
    expect(refresh.className).toContain('32px');
    expect(refresh.className).toContain('focus-visible:outline');
    expect(refresh).toHaveTextContent('');
    expect(refresh.querySelector('svg')).not.toBeNull();
  });

  it('uses the typed Flow catalog instead of the App-local skill directory for managed status', async () => {
    render(
      <SkillsHubSettings
        withWrapper={false}
        displayGroup='flow'
        flowManagedSkillIds={['ui-ux-pro-max', 'mineru-document-extractor']}
        flowManagedSkillDependencies={[
          {
            id: 'ui-ux-pro-max',
            kind: 'codex_skill',
            installed: true,
            version: '1.2.3',
            currentness: 'current',
            ownership: 'opl_managed',
            updateMode: 'silent_managed',
            external: false,
          },
          {
            id: 'mineru-document-extractor',
            kind: 'codex_skill',
            installed: false,
            currentness: 'missing',
            ownership: 'opl_managed',
            updateMode: 'silent_managed',
            external: false,
          },
        ]}
        onSyncFlow={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('opl-flow-capability-ui-ux-pro-max')).toBeInTheDocument());
    expect(screen.getByTestId('settings-capabilities-primary-action').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('opl-flow-capability-ui-ux-pro-max')).toHaveTextContent(
      'settings.capabilitiesPage.groups.oplFlowManaged.managed'
    );
    expect(screen.getByTestId('opl-flow-capability-mineru-document-extractor')).toHaveTextContent(
      'settings.capabilitiesPage.groups.oplFlowManaged.missing'
    );
    const details = screen.getByTestId('opl-flow-capability-details-ui-ux-pro-max') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('settings.uiOptimization.capabilities.details.source');
    expect(details).toHaveTextContent('settings.uiOptimization.capabilities.details.version');
    expect(details).toHaveTextContent('1.2.3');
  });

  it('uses the owner-projected Flow skill description in the summary and collapsed details', async () => {
    render(
      <SkillsHubSettings
        withWrapper={false}
        displayGroup='flow'
        flowManagedSkillIds={['med-autoscience']}
        flowManagedSkillDependencies={[
          {
            id: 'med-autoscience',
            kind: 'codex_skill',
            installed: true,
            version: '0.2.15',
            currentness: 'current',
            ownership: 'opl_managed',
            updateMode: 'silent_managed',
            external: false,
          },
        ]}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('opl-flow-capability-details-med-autoscience')).toHaveTextContent('MAS skill')
    );
    const row = screen.getByTestId('opl-flow-capability-med-autoscience');
    expect(row).toHaveTextContent('MAS skill');
    const details = within(row).getByTestId('opl-flow-capability-details-med-autoscience') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('MAS skill');
    expect(details).toHaveTextContent('0.2.15');
  });
});
