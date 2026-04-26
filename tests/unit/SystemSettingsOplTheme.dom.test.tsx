import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

const mockRunOplCommand = vi.fn();
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings/opl' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: { invoke: (...args: unknown[]) => mockRunOplCommand(...args) },
    },
    application: {
      appVersions: { invoke: vi.fn().mockResolvedValue({ oplVersion: '26.4.25', guiVersion: '1.9.21' }) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
    set: (...args: unknown[]) => mockConfigSet(...args),
  },
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-modal-content' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-modal-content' />,
}));

vi.mock('@/renderer/pages/settings/OplAppearanceThemeSettings', () => ({
  default: () => <div data-testid='opl-appearance-theme-settings' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/hooks/system/useOplBrandName', () => ({
  OPL_DEFAULT_BRAND_NAME: 'One Person Lab',
  normalizeOplBrandName: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'One Person Lab',
  dispatchOplBrandNameChanged: vi.fn(),
}));

vi.mock('@/renderer/assets/logos/opl-modules/mas.svg', () => ({ default: 'mas.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mds.svg', () => ({ default: 'mds.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mag.svg', () => ({ default: 'mag.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/rca.svg', () => ({ default: 'rca.svg' }));
vi.mock('@/renderer/assets/logos/tools/coding/codex.svg', () => ({ default: 'codex.svg' }));
vi.mock('@/renderer/assets/logos/brand/hermes.svg', () => ({ default: 'hermes.svg' }));
vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'app.png' }));

import SystemSettings from '@/renderer/pages/settings/SystemSettings';

describe('SystemSettings OPL appearance section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockConfigGet.mockResolvedValue('One Person Lab');
    mockConfigSet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
  });

  it('mounts the CSS theme selector on the OPL environment page', async () => {
    render(<SystemSettings />);

    expect(await screen.findByText('settings.oplEnvironmentPage.appearanceTitle')).toBeInTheDocument();
    expect(screen.getByText('settings.oplEnvironmentPage.appearanceDescription')).toBeInTheDocument();
    expect(screen.getByTestId('opl-appearance-theme-settings')).toBeInTheDocument();
  });
});
