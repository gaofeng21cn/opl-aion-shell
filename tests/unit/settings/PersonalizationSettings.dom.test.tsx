import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OplPersonalizationSettings from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings';

const mocks = vi.hoisted(() => ({
  executeAction: vi.fn(),
  load: vi.fn(),
  setConfig: vi.fn(),
  confirm: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Modal: Object.assign(actual.Modal, { confirm: mocks.confirm }),
    Message: { ...actual.Message, success: mocks.messageSuccess, error: mocks.messageError },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: mocks.executeAction },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: { set: mocks.setConfig },
}));

vi.mock('@/renderer/hooks/config/useConfig', () => ({
  useConfig: () => ['Additional context', vi.fn()],
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  useOplAppState: () => ({
    appState: {
      codex_personalization: {
        user_agents: {
          status: 'available',
          path: '/Users/example/.codex/AGENTS.md',
          content: 'Always answer directly.\n',
          sha256: 'sha-current',
        },
        opl_flow_default_user_agents: {
          status: 'available',
          package_version: '0.1.16',
          sha256: 'sha-default',
        },
      },
    },
    refreshing: false,
    load: mocks.load,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, string>) =>
      ({
        'settings.personalization.pageTitle': 'Personalization',
        'settings.personalization.pageDescription': 'Instructions and new conversation context.',
        'settings.personalization.systemAgentsTitle': 'System AGENTS.md',
        'settings.personalization.systemAgentsDescription': 'Instructions for every task.',
        'settings.personalization.systemAgentsPlaceholder': 'Persistent instructions',
        'settings.personalization.systemAgentsTooLarge': 'Too large',
        'settings.personalization.restoreOplFlowDefault': 'Restore OPL Flow default',
        'settings.personalization.restoreSystemAgentsTitle': 'Restore system AGENTS.md?',
        'settings.personalization.restoreSystemAgentsConfirm': 'Replace with the installed OPL Flow default.',
        'settings.personalization.systemAgentsRestored': 'Restored',
        'settings.personalization.oplFlowDefaultVersion': `Installed OPL Flow default version: ${options?.version}`,
        'settings.personalization.oplFlowDefaultUnavailable': 'Default unavailable',
        'settings.personalization.sessionContextTitle': 'OPL App session context',
        'settings.personalization.sessionContextDescription': 'Context for new conversations.',
        'settings.personalization.generatedContextLabel': 'Generated base context',
        'settings.personalization.generatedContextHelp': 'Read-only and updated automatically.',
        'settings.personalization.viewGeneratedContext': 'View',
        'settings.personalization.additionalContextLabel': 'Additional user instructions',
        'settings.personalization.additionalContextPlaceholder': 'Additional instructions',
        'settings.personalization.restoreDefault': 'Restore default',
        'settings.personalization.save': 'Save',
        'settings.personalization.reload': 'Reload',
        'settings.personalization.nextConversationEffect': 'Applies to the next conversation.',
        'settings.personalization.saveFailed': 'Save failed',
        'common.cancel': 'Cancel',
      })[key] ?? key,
  }),
}));

describe('OplPersonalizationSettings', () => {
  it('renders the personalization content embedded by the Workspace page', async () => {
    mocks.executeAction.mockResolvedValue({ ok: true, data: {} });
    mocks.load.mockResolvedValue(undefined);
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.confirm.mockImplementation(({ onOk }: { onOk?: () => unknown }) => void onOk?.());

    render(<OplPersonalizationSettings />);

    expect(screen.getByTestId('settings-personalization-instructions')).toBeInTheDocument();
    expect(screen.getByTestId('settings-system-agents-editor')).toHaveTextContent('/Users/example/.codex/AGENTS.md');
    expect(screen.getByTestId('settings-system-agents-editor')).toHaveTextContent(
      'Installed OPL Flow default version: 0.1.16'
    );
    const contextEditors = screen.getByTestId('settings-opl-app-context-editor').querySelectorAll('textarea');
    expect(contextEditors).toHaveLength(1);
    expect(contextEditors[0]).not.toHaveAttribute('readonly');
    expect(screen.queryByTestId('settings-generated-context-preview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-generated-context-action'));
    expect(await screen.findByTestId('settings-generated-context-preview')).toHaveTextContent('MAS (Med Auto Science)');
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore OPL Flow default' }));
    await waitFor(() =>
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'codex_user_instructions_restore_opl_flow_default',
        dryRun: false,
        payloadJson: { expected_sha256: 'sha-current' },
      })
    );
  });
});
