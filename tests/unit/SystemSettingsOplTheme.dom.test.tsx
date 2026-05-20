import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockUnstableMessageApi = vi.hoisted(() => ({ enabled: false }));
const mockRuntimeMessages = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
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
    loading,
    icon: _icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: React.ReactNode }) => (
    <button {...props} aria-busy={loading ? 'true' : undefined}>
      {children}
    </button>
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
  const Message = {
    useMessage: () => [
      mockUnstableMessageApi.enabled ? { success: vi.fn(), warning: vi.fn(), error: vi.fn() } : mockRuntimeMessages,
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

vi.mock('@/renderer/assets/logos/opl-modules/mas.png', () => ({ default: 'mas.png' }));
vi.mock('@/renderer/assets/logos/opl-modules/mds.svg', () => ({ default: 'mds.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mag.png', () => ({ default: 'mag.png' }));
vi.mock('@/renderer/assets/logos/opl-modules/rca.png', () => ({ default: 'rca.png' }));
vi.mock('@/renderer/assets/logos/tools/coding/codex.svg', () => ({ default: 'codex.svg' }));
vi.mock('@/renderer/assets/logos/brand/hermes.svg', () => ({ default: 'hermes.svg' }));
vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'app.png' }));

import RuntimeSettings, { resolveEngineAction } from '@/renderer/pages/settings/sections/RuntimeSettings';

(
  globalThis as typeof globalThis & {
    __OPL_ENVIRONMENT_STATUS_TIMEOUT_MS__?: number;
    __OPL_ENVIRONMENT_ACTION_TIMEOUT_MS__?: number;
  }
).__OPL_ENVIRONMENT_STATUS_TIMEOUT_MS__ = 5;
(
  globalThis as typeof globalThis & {
    __OPL_ENVIRONMENT_STATUS_TIMEOUT_MS__?: number;
    __OPL_ENVIRONMENT_ACTION_TIMEOUT_MS__?: number;
  }
).__OPL_ENVIRONMENT_ACTION_TIMEOUT_MS__ = 5;

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

  it('does not require missing optional Hermes capability when Codex is the interaction layer', async () => {
    mockConfigGet.mockImplementation(async (key: string) => (key === 'opl.interactionLayer' ? 'codex' : null));
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {
            codex: { installed: true, version: 'codex-cli 0.125.0', health_status: 'ready' },
            hermes: { installed: false, health_status: 'missing' },
          },
          domain_modules: { modules: [] },
        },
      }),
      stderr: '',
    });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    expect(await screen.findByText('Codex CLI')).toBeInTheDocument();
    expect(screen.queryByText('Hermes-Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.oplEnvironmentPage.actions.install')).not.toBeInTheDocument();
  });

  it('shows Hermes as an optional capability when it is installed', async () => {
    mockConfigGet.mockImplementation(async (key: string) => (key === 'opl.interactionLayer' ? 'codex' : null));
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {
            codex: { installed: true, version: 'codex-cli 0.125.0', health_status: 'ready' },
            hermes: { installed: true, version: 'hermes-agent 0.9.0', health_status: 'ready' },
          },
          domain_modules: { modules: [] },
        },
      }),
      stderr: '',
    });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    expect(await screen.findByText('Hermes-Agent')).toBeInTheDocument();
    expect(screen.getByText('settings.oplEnvironmentPage.items.hermes.role')).toBeInTheDocument();
    expect(screen.queryByText('settings.oplEnvironmentPage.actions.install')).not.toBeInTheDocument();
  });

  it('shows dirty installed Foundry modules as available with separate development diagnostics', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {},
          domain_modules: {
            modules: [
              {
                module_id: 'medautoscience',
                label: 'Med Auto Science',
                installed: true,
                health_status: 'dirty',
                recommended_action: null,
                available_actions: [],
                git: {
                  branch: 'main',
                  short_sha: '4b2357c',
                  dirty: true,
                  ahead_count: 3,
                  sync_status: 'ahead',
                },
              },
            ],
          },
        },
      }),
      stderr: '',
    });

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    const masModuleName = await screen.findByText('Med AutoScience (MAS)');
    expect(masModuleName).toBeInTheDocument();
    expect(screen.getAllByText('settings.oplEnvironmentPage.status.ready:ready').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('settings.oplEnvironmentPage.moduleDiagnostic:dirty · ahead · ahead 3')
    ).toBeInTheDocument();
    const masModuleRow = masModuleName.closest('div.justify-between');
    expect(masModuleRow).toBeTruthy();
    expect(
      within(masModuleRow as HTMLElement).queryByText('settings.oplEnvironmentPage.actions.update')
    ).not.toBeInTheDocument();
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
    const updateModalEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => {
        return event instanceof CustomEvent && event.type === 'aionui-open-update-modal';
      });
    expect(updateModalEvent).toBeInstanceOf(CustomEvent);
    expect((updateModalEvent as CustomEvent).detail).toEqual({ status: 'downloaded', source: 'one-click' });
    expect(await screen.findByText('settings.oplEnvironmentPage.updateState.ready')).toBeInTheDocument();
    dispatchSpy.mockRestore();
  });

  it('settles a slow environment refresh and tells the user to continue using the app', async () => {
    mockRunOplCommand.mockReturnValue(new Promise(() => {}));

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    const refreshButton = await screen.findByText('settings.oplEnvironmentPage.actions.refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(refreshButton).not.toHaveAttribute('aria-busy');
      expect(mockRuntimeMessages.warning).toHaveBeenCalledWith(
        'settings.oplEnvironmentPage.messages.loadModulesFailed'
      );
    });
  });

  it('settles a slow repair command without exposing command output', async () => {
    mockRunOplCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
    mockRunOplCommand.mockReturnValueOnce(new Promise(() => {}));

    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.tabs.environment'));

    const repairButton = await screen.findByText('settings.oplEnvironmentPage.actions.repair');
    fireEvent.click(repairButton);

    await waitFor(() => {
      expect(repairButton).not.toHaveAttribute('aria-busy');
      expect(mockRuntimeMessages.warning).toHaveBeenCalledWith(
        'settings.oplEnvironmentPage.messages.backgroundOperationStillRunning'
      );
    });
    expect(mockRuntimeMessages.error).not.toHaveBeenCalledWith(expect.stringContaining('stderr'));
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

  it('does not offer install actions for missing optional Hermes capability', () => {
    expect(resolveEngineAction({ installed: false }, 'hermes', true)).toBeNull();
  });
});
