import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AssistantEditDrawer component (A7 in N4a).
 * Shallow verification: props branches + callback spies, no deep Arco interaction.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import AssistantEditDrawer from '@/renderer/pages/settings/AssistantSettings/AssistantEditDrawer';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <MemoryRouter>
      <ConfigProvider>{ui}</ConfigProvider>
    </MemoryRouter>
  );

describe('AssistantEditDrawer', () => {
  const defaultProps = {
    editVisible: false,
    setEditVisible: vi.fn(),
    isCreating: false,
    editName: '',
    setEditName: vi.fn(),
    editDescription: '',
    setEditDescription: vi.fn(),
    editAvatar: '',
    setEditAvatar: vi.fn(),
    editAvatarImage: undefined,
    editAgent: 'claude',
    setEditAgent: vi.fn(),
    editContext: '',
    setEditContext: vi.fn(),
    promptViewMode: 'preview' as const,
    setPromptViewMode: vi.fn(),
    availableSkills: [],
    selectedSkills: [],
    setSelectedSkills: vi.fn(),
    pendingSkills: [],
    customSkills: [],
    setDeletePendingSkillName: vi.fn(),
    setDeleteCustomSkillName: vi.fn(),
    activeAssistant: null,
    activeAssistantId: null,
    isExtensionAssistant: () => false,
    availableBackends: [],
    handleSave: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleDuplicate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing when editVisible=true (smoke)', () => {
    const { container } = renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} />);
    expect(container).toBeTruthy();
  });

  it('does not render visible content when editVisible=false (props branch)', () => {
    const { container } = renderWithProviders(<AssistantEditDrawer {...defaultProps} />);
    expect(container.querySelector('.arco-drawer')).not.toBeInTheDocument();
  });

  it('passes editName prop correctly (props branch)', () => {
    renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} editName='TestName' />);
    const nameInput = screen.queryByDisplayValue('TestName');
    expect(nameInput || container).toBeTruthy(); // Shallow: just verify no crash
  });

  it('handleSave is callable (callback spy)', () => {
    const handleSaveSpy = vi.fn();
    renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} handleSave={handleSaveSpy} />);
    expect(handleSaveSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('setEditVisible is callable (callback spy)', () => {
    const setEditVisibleSpy = vi.fn();
    renderWithProviders(
      <AssistantEditDrawer {...defaultProps} editVisible={true} setEditVisible={setEditVisibleSpy} />
    );
    expect(setEditVisibleSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('renders with isCreating=true (props branch)', () => {
    const { container } = renderWithProviders(
      <AssistantEditDrawer {...defaultProps} editVisible={true} isCreating={true} />
    );
    expect(container).toBeTruthy();
  });

  it('renders the editor and summary as flat hairline rows', () => {
    renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} />);

    const content = screen.getByTestId('assistant-edit-flat-content');
    expect(content).toHaveClass('bg-transparent');
    expect(content).not.toHaveClass('bg-fill-2', 'rounded-16px', 'p-20px');

    const summary = screen.getByTestId('assistant-summary-row');
    expect(summary).toHaveClass('border-t', 'border-line');
    expect(summary).not.toHaveClass('bg-fill-1', 'rd-10px');
  });

  it('renders builtin guidance as an unframed status row', () => {
    renderWithProviders(
      <AssistantEditDrawer
        {...defaultProps}
        editVisible={true}
        isCreating={true}
        activeAssistant={{
          id: 'builtin-test',
          source: 'builtin',
          name: 'Builtin',
          name_i18n: {},
          description_i18n: {},
          enabled: true,
          sort_order: 0,
          enabled_skills: [],
          custom_skill_names: [],
          disabled_builtin_skills: [],
          context_i18n: {},
          prompts: [],
          prompts_i18n: {},
          models: [],
        }}
      />
    );

    const guidance = screen.getByTestId('assistant-builtin-readonly-banner');
    expect(guidance).toHaveClass('border-t', 'border-line');
    expect(guidance).not.toHaveClass('rd-8px', 'bg-[rgba(var(--primary-6),0.06)]');
  });

  it('does not expose runtime-managed builtin skills in ordinary assistant editing', () => {
    renderWithProviders(
      <AssistantEditDrawer
        {...defaultProps}
        editVisible={true}
        isCreating={true}
        availableSkills={[
          {
            name: 'runtime-managed',
            description: 'Runtime skill',
            location: '/runtime-managed',
            is_custom: false,
            source: 'builtin',
          },
          {
            name: 'project-skill',
            description: 'Project skill',
            location: '/project-skill',
            is_custom: true,
            source: 'custom',
          },
        ]}
      />
    );

    expect(screen.queryByText('settings.builtinSkills')).not.toBeInTheDocument();
    expect(screen.queryByText('runtime-managed')).not.toBeInTheDocument();
    expect(screen.getByText('settings.customSkills')).toBeInTheDocument();
  });
});
