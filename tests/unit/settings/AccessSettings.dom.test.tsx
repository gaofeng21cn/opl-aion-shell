import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';

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
    t: (key: string, options?: { status?: string }) => {
      const labels: Record<string, string> = {
        'settings.accessPage.title': 'Access',
        'settings.accessPage.description': 'Can Codex CLI, access keys, and the local service work now?',
        'settings.accessPage.cards.codex.title': 'Codex CLI',
        'settings.accessPage.cards.codex.fallback': 'Codex CLI details are not available yet.',
        'settings.accessPage.cards.key.title': 'Access Keys',
        'settings.accessPage.cards.key.configured': 'Access configuration is present.',
        'settings.accessPage.cards.key.missing': 'Access configuration needs attention.',
        'settings.accessPage.cards.provider.title': 'Local Background Service',
        'settings.accessPage.cards.provider.fallback': 'Background service details are not available yet.',
        'settings.accessPage.cards.provider.detail':
          'Used for local OPL task execution; this is not gflabtoken or external API login status.',
        'settings.accessPage.cards.permission.title': 'Permission Mode',
        'settings.accessPage.cards.permission.detail': 'Current command and file permissions used by the App executor.',
        'settings.oplEnvironmentPage.status.ready': 'ready',
        'agentMode.full-access': 'Full Access',
      };
      return labels[key] ?? options?.status ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('AccessSettingsContent', () => {
  it('renders readiness cards before remote access controls from the fast App state projection', () => {
    render(<AccessSettingsContent />);

    expect(screen.getByText('Can Codex CLI, access keys, and the local service work now?')).toBeInTheDocument();
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    expect(document.body.textContent).toContain('/usr/local/bin/codex');
    expect(screen.getByText('Access Keys')).toBeInTheDocument();
    expect(screen.getByText('Access configuration is present.')).toBeInTheDocument();
    expect(screen.getByText('Local Background Service')).toBeInTheDocument();
    expect(screen.getByText(/not gflabtoken/)).toBeInTheDocument();
    expect(screen.getByText(/127\.0\.0\.1:7233/)).toBeInTheDocument();
    expect(screen.getByText('Permission Mode')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('settings.oplEnvironmentPage.status.full-access');

    const firstReadinessCard = screen.getByText('Codex CLI');
    const remoteControls = screen.getByTestId('webui-content');
    expect(firstReadinessCard.compareDocumentPosition(remoteControls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
