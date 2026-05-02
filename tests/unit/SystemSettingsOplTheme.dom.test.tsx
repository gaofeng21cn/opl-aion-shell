import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockUnstableMessageApi = vi.hoisted(() => ({ enabled: false }));
const mockRunOplCommand = vi.fn();
const mockAutoUpdateCheck = vi.fn();
const mockAutoUpdateDownload = vi.fn();
const mockAutoUpdateQuitAndInstall = vi.fn();
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockGetPath = vi.fn();
const mockReadFile = vi.fn();
const mockSetSearchParams = vi.fn();

vi.mock('react-i18next', () => {
  const t = (key: string, options?: Record<string, string>) =>
    options ? `${key}:${Object.values(options).join('|')}` : key;
  return {
    useTranslation: () => ({ t }),
  };
});

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings/runtime' }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
}));

vi.mock('@arco-design/web-react', async () => {
  const React = await import('react');
  const Text = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;
  const Title = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { heading?: number }) => (
    <h4 {...props}>{children}</h4>
  );
  const Typography = { Text, Title };
  const Button = ({
    children,
    loading: _loading,
    icon: _icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  );
  const Card = ({
    children,
    bordered: _bordered,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { bordered?: boolean }) => <div {...props}>{children}</div>;
  const Space = ({ children, wrap: _wrap, ...props }: React.HTMLAttributes<HTMLDivElement> & { wrap?: boolean }) => (
    <div {...props}>{children}</div>
  );
  const Tag = ({
    children,
    color: _color,
    size: _size,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { color?: string; size?: string }) => <span {...props}>{children}</span>;
  const Input = Object.assign(
    ({ value, onChange, onPressEnter, ...props }: any) => (
      <input
        {...props}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onPressEnter?.();
        }}
      />
    ),
    {
      TextArea: ({ value, onChange, ...props }: any) => (
        <textarea {...props} value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
      ),
    }
  );
  const Radio = {
    Group: ({
      options = [],
      onChange,
    }: {
      options?: Array<{ label: string; value: string }>;
      onChange?: (value: string) => void;
    }) => (
      <div>
        {options.map((option) => (
          <button key={option.value} type='button' onClick={() => onChange?.(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    ),
  };
  const Collapse = Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => (
      <div>
        <button type='button'>{header}</button>
        <div>{children}</div>
      </div>
    ),
  });
  const Tabs = Object.assign(
    ({ children, onChange }: { children: React.ReactNode; onChange?: (key: string) => void }) => (
      <div>
        {React.Children.toArray(children).map((child) => {
          if (!React.isValidElement<{ title?: React.ReactNode }>(child)) return null;
          const key = String(child.key).replace(/^\.\$/, '');
          return (
            <button key={key} type='button' onClick={() => onChange?.(key)}>
              {child.props.title}
            </button>
          );
        })}
      </div>
    ),
    { TabPane: (_props: { title?: React.ReactNode }) => null }
  );
  const messageApi = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
  const Message = {
    useMessage: () => [
      mockUnstableMessageApi.enabled ? { success: vi.fn(), warning: vi.fn(), error: vi.fn() } : messageApi,
      null,
    ],
  };
  return { Button, Card, Collapse, Input, Message, Radio, Space, Tabs, Tag, Typography };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: { invoke: (...args: unknown[]) => mockRunOplCommand(...args) },
    },
    application: {
      appVersions: { invoke: vi.fn().mockResolvedValue({ oplVersion: '26.4.25', guiVersion: '1.9.21' }) },
      getPath: { invoke: (...args: unknown[]) => mockGetPath(...args) },
    },
    autoUpdate: {
      check: { invoke: (...args: unknown[]) => mockAutoUpdateCheck(...args) },
      download: { invoke: (...args: unknown[]) => mockAutoUpdateDownload(...args) },
      quitAndInstall: { invoke: (...args: unknown[]) => mockAutoUpdateQuitAndInstall(...args) },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
    },
    fs: {
      readFile: { invoke: (...args: unknown[]) => mockReadFile(...args) },
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

import RuntimeSettings, { resolveEngineAction } from '@/renderer/pages/settings/sections/RuntimeSettings';

describe('RuntimeSettings OPL environment section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnstableMessageApi.enabled = false;
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
    mockGetPath.mockResolvedValue('/Users/tester');
    mockReadFile.mockResolvedValue('');
    mockAutoUpdateCheck.mockResolvedValue({ success: true });
    mockAutoUpdateDownload.mockResolvedValue({ success: true });
    mockAutoUpdateQuitAndInstall.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
  });

  it('keeps personalization controls out of the environment page', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    expect(await screen.findByText('settings.oplEnvironmentPage.title')).toBeInTheDocument();
    expect(screen.getByTestId('opl-settings-environment')).toBeInTheDocument();
    expect(screen.getByText('settings.oplEnvironmentPage.maintenanceTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-appearance-theme-settings')).not.toBeInTheDocument();
  });

  it('does not repeat environment status loads when the message API identity changes', async () => {
    mockUnstableMessageApi.enabled = true;

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));
    expect(await screen.findByText('settings.oplEnvironmentPage.title')).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
  });

  it('separates Codex diagnostics and Hermes update summary from version rows', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {
            codex: {
              installed: true,
              version: 'codex-cli 0.125.0',
              parsed_version: '0.125.0',
              minimum_version: '0.125.0',
              version_status: 'compatible',
              binary_path: '/opt/homebrew/bin/codex',
              binary_source: 'path',
              candidates: [
                {
                  path: '/opt/homebrew/bin/codex',
                  selected: true,
                  parsed_version: '0.125.0',
                  version_status: 'compatible',
                },
                {
                  path: '/usr/local/bin/codex',
                  selected: false,
                  parsed_version: '0.125.0',
                  version_status: 'compatible',
                },
                {
                  path: '/Users/gaofeng/.nvm/versions/node/v22.16.0/bin/codex',
                  selected: false,
                  parsed_version: '0.125.0',
                  version_status: 'compatible',
                },
              ],
              health_status: 'ready',
              issues: [],
              diagnostics: ['codex_cli_path_version_conflict_nonblocking'],
            },
            hermes: {
              installed: true,
              version: 'hermes-agent 0.9.0',
              update_available: true,
              update_summary: 'Hermes 0.10.0 is available\nRun hermes update',
              health_status: 'ready',
            },
          },
          domain_modules: { modules: [] },
        },
      }),
      stderr: '',
    });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    expect(
      await screen.findByText(/settings\.oplEnvironmentPage\.selectedBinary:\/opt\/homebrew\/bin\/codex/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.oplEnvironmentPage\.diagnostics\.issues\.codexCliCompatiblePathDuplicate/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/settings\.oplEnvironmentPage\.diagnostics\.issues\.codexCliPathVersionConflict/)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/\/usr\/local\/bin\/codex/)).toBeInTheDocument();
    expect(screen.getByText(/\/Users\/gaofeng\/\.nvm\/versions\/node\/v22\.16\.0\/bin\/codex/)).toBeInTheDocument();
    expect(
      screen.getByText('settings.oplEnvironmentPage.updateSummary:Hermes 0.10.0 is available')
    ).toBeInTheDocument();
    expect(
      screen.getByText('settings.oplEnvironmentPage.latestVersion:settings.oplEnvironmentPage.items.hermes.latest:')
    ).toBeInTheDocument();
    expect(screen.queryByText('attention_needed')).not.toBeInTheDocument();
  });

  it('keeps blocking Codex path conflicts visible as version conflicts', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {
            codex: {
              installed: true,
              version: 'codex-cli 0.125.0',
              parsed_version: '0.125.0',
              minimum_version: '0.125.0',
              version_status: 'compatible',
              binary_path: '/opt/homebrew/bin/codex',
              binary_source: 'path',
              candidates: [
                {
                  path: '/opt/homebrew/bin/codex',
                  selected: true,
                  parsed_version: '0.125.0',
                  version_status: 'compatible',
                },
                {
                  path: '/Applications/One Person Lab.app/Contents/Resources/codex',
                  selected: false,
                  parsed_version: '0.121.0',
                  version_status: 'outdated',
                },
              ],
              health_status: 'ready',
              issues: [],
              diagnostics: ['codex_cli_path_version_conflict'],
            },
          },
          domain_modules: { modules: [] },
        },
      }),
      stderr: '',
    });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    expect(
      await screen.findByText(/settings\.oplEnvironmentPage\.diagnostics\.issues\.codexCliPathVersionConflict/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/settings\.oplEnvironmentPage\.diagnostics\.issues\.codexCliCompatiblePathDuplicate/)
    ).not.toBeInTheDocument();
  });

  it('runs OPL system update before downloading an app update without installing it', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockAutoUpdateCheck.mockResolvedValue({
      success: true,
      data: { updateInfo: { version: '1.9.22' } },
    });
    mockAutoUpdateDownload.mockResolvedValue({ success: true });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    const updateButton = await screen.findByText('settings.oplEnvironmentPage.actions.oneClickUpdate');
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'update'] });
    });
    await waitFor(() => {
      expect(mockAutoUpdateCheck).toHaveBeenCalledWith({ includePrerelease: false });
      expect(mockAutoUpdateDownload).toHaveBeenCalledTimes(1);
    });
    expect(mockAutoUpdateQuitAndInstall).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'aionui-open-update-modal',
        detail: { status: 'downloaded' },
      })
    );
    dispatchSpy.mockRestore();
  });
});

describe('RuntimeSettings OPL engine action policy', () => {
  it('does not offer Codex updates when the installed version is compatible', () => {
    expect(resolveEngineAction({ installed: true, version_status: 'compatible' }, 'codex')).toBeNull();
  });

  it('offers Codex updates only when the CLI version needs attention', () => {
    expect(resolveEngineAction({ installed: true, version_status: 'outdated' }, 'codex')).toBe('update');
    expect(resolveEngineAction({ installed: true, version_status: 'unknown' }, 'codex')).toBe('update');
  });

  it('offers Hermes updates only when Hermes reports an available update', () => {
    expect(resolveEngineAction({ installed: true, update_available: false }, 'hermes')).toBeNull();
    expect(resolveEngineAction({ installed: true, update_available: true }, 'hermes')).toBe('update');
  });
});
