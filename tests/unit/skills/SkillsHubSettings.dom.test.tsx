import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillsHubSettings component (SK3 in N4a).
 * Shallow verification: module import + basic structure.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

  it('filters upstream AionUI auto-injected skills from the App capabilities surface', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => {
      expect(screen.getByText('MAS skill')).toBeInTheDocument();
    });

    expect(screen.queryByText('aionui-skills')).not.toBeInTheDocument();
    expect(screen.queryByText('AionUI implementation helper')).not.toBeInTheDocument();
  });
});
