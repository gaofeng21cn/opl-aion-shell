import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='webui-content'>Remote access settings</div>,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      core: {
        codex: {
          status: 'ready',
          model: 'gpt-5.5',
          version: '0.125.0',
          binary_path: '/usr/local/bin/codex',
          config: {
            api_key_present: true,
          },
        },
        executor: {
          permission_mode: 'full-access',
        },
      },
      provider: {
        provider_kind: 'temporal',
        health_status: 'ready',
        temporal: {
          status: 'ready',
          details: {
            address: '127.0.0.1:7233',
          },
        },
      },
    },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.accessPage.title': 'Model & Account',
        'settings.accessPage.description':
          'Confirm model and account access, then configure Web, Docker, and remote access.',
        'settings.accessPage.cards.model.title': 'Current Model',
        'settings.accessPage.cards.model.fallback': 'Current model is not available yet.',
        'settings.accessPage.cards.account.title': 'Account / API key',
        'settings.accessPage.cards.account.configured': 'Account or API key is configured.',
        'settings.accessPage.cards.account.missing': 'Account or API key needs attention.',
        'settings.accessPage.cards.modelAccess.title': 'Model Access Status',
        'settings.accessPage.cards.modelAccess.detail':
          'Checks whether the local assistant can reach the configured model service.',
        'settings.accessPage.cards.provider.summary': `${options?.kind} · ${options?.status}`,
        'settings.accessPage.cards.provider.localRuntime': 'Local runtime service',
        'settings.accessPage.cards.permission.title': 'Permission Mode',
        'settings.accessPage.cards.permission.detail': 'Current command and file permissions used by the App executor.',
        'settings.accessPage.localServiceTechnicalDetail': `Technical detail: local service address ${options?.address}. Model & Account shows account/API key status.`,
        'settings.accessPage.modelAccount.title': 'Model & Account',
        'settings.accessPage.modelAccount.description':
          'Shows the current model, account/API key, model access, and permission status without exposing raw backend/provider selectors.',
        'settings.accessPage.remote.title': 'Web / Docker / Remote Access',
        'settings.accessPage.remote.description':
          'Enable WebUI, inspect access URLs, and find remote access configuration from one place.',
        'settings.accessPage.remote.webui': 'WebUI',
        'settings.accessPage.remote.docker': 'Docker',
        'settings.accessPage.remote.remoteAccess': 'Remote access',
        'settings.accessPage.actions.recheck': 'Recheck',
        'settings.accessPage.actions.fix': 'Fix issue',
        'settings.oplEnvironmentPage.status.ready': 'ready',
        'agentMode.full-access': 'Full Access',
      };
      return labels[key] ?? options?.status ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('AccessSettingsContent', () => {
  it('renders user-facing model, account, and remote access entries from the fast App state projection', () => {
    render(<AccessSettingsContent />);

    expect(screen.getAllByText('Model & Account')).toHaveLength(2);
    expect(
      screen.getByText('Confirm model and account access, then configure Web, Docker, and remote access.')
    ).toBeInTheDocument();
    expect(screen.getByText('Current Model')).toBeInTheDocument();
    expect(document.body.textContent).toContain('gpt-5.5');
    expect(document.body.textContent).toContain('/usr/local/bin/codex');
    expect(screen.getByText('Account / API key')).toBeInTheDocument();
    expect(screen.getByText('Account or API key is configured.')).toBeInTheDocument();
    expect(screen.getByText('Model Access Status')).toBeInTheDocument();
    expect(screen.getByText(/configured model service/)).toBeInTheDocument();
    expect(screen.getByText(/127\.0\.0\.1:7233/)).toBeInTheDocument();
    expect(screen.getByText('temporal · ready')).toBeInTheDocument();
    expect(screen.getByText(/Model & Account shows account\/API key status/)).toBeInTheDocument();
    expect(screen.getByText('Web / Docker / Remote Access')).toBeInTheDocument();
    expect(screen.getByText('WebUI')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('Remote access')).toBeInTheDocument();
    expect(screen.getByText('Permission Mode')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Codex CLI');
    expect(document.body.textContent).not.toContain('Access Keys');
    expect(document.body.textContent).not.toContain('Local Background Service');
    expect(document.body.textContent).not.toContain('gflabtoken');
    expect(document.body.textContent).not.toContain('settings.oplEnvironmentPage.status.full-access');

    const firstReadinessCard = screen.getByText('Current Model');
    const remoteControls = screen.getByTestId('webui-content');
    expect(firstReadinessCard.compareDocumentPosition(remoteControls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
