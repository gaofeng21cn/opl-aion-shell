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
        'settings.accessPage.description': 'Can Codex CLI and providers work now?',
        'settings.accessPage.cards.codex.title': 'Codex CLI',
        'settings.accessPage.cards.codex.fallback': 'Codex CLI details are not available yet.',
        'settings.accessPage.cards.key.title': 'Provider Keys',
        'settings.accessPage.cards.key.configured': 'Access configuration is present.',
        'settings.accessPage.cards.key.missing': 'Access configuration needs attention.',
        'settings.accessPage.cards.provider.title': 'Provider Access',
        'settings.accessPage.cards.provider.fallback': 'Provider readiness details are not available yet.',
        'settings.accessPage.cards.permission.title': 'Permission Mode',
        'settings.accessPage.cards.permission.detail': 'Current command and file permissions used by the App executor.',
        'settings.oplEnvironmentPage.status.ready': 'ready',
      };
      return labels[key] ?? options?.status ?? key;
    },
  }),
}));

describe('AccessSettingsContent', () => {
  it('renders readiness cards before remote access controls from the fast App state projection', () => {
    render(<AccessSettingsContent />);

    expect(screen.getByText('Can Codex CLI and providers work now?')).toBeInTheDocument();
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    expect(document.body.textContent).toContain('/usr/local/bin/codex');
    expect(screen.getByText('Provider Keys')).toBeInTheDocument();
    expect(screen.getByText('Access configuration is present.')).toBeInTheDocument();
    expect(screen.getByText('Provider Access')).toBeInTheDocument();
    expect(screen.getByText(/127\.0\.0\.1:7233/)).toBeInTheDocument();
    expect(screen.getByText('Permission Mode')).toBeInTheDocument();
    expect(screen.getByText('full-access')).toBeInTheDocument();

    const firstReadinessCard = screen.getByText('Codex CLI');
    const remoteControls = screen.getByTestId('webui-content');
    expect(firstReadinessCard.compareDocumentPosition(remoteControls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
