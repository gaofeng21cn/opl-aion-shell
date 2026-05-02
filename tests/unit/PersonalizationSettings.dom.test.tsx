import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockUnstableMessageApi = vi.hoisted(() => ({ enabled: false }));
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockRunOplCommand = vi.fn();
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
      check: { invoke: vi.fn().mockResolvedValue({ success: true }) },
      download: { invoke: vi.fn().mockResolvedValue({ success: true }) },
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

vi.mock('@/renderer/hooks/system/useOplBrandName', () => ({
  OPL_DEFAULT_BRAND_NAME: 'One Person Lab',
  normalizeOplBrandName: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'One Person Lab',
  dispatchOplBrandNameChanged: vi.fn(),
}));

vi.mock('@/renderer/pages/settings/OplAppearanceThemeSettings', () => ({
  default: () => <div data-testid='opl-appearance-theme-settings' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/DisplayModalContent', () => ({
  default: () => <div data-testid='display-settings-content' />,
}));

vi.mock('@/renderer/pages/settings/PetSettings', () => ({
  PetSettingsContent: () => <div data-testid='pet-settings-content' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/assets/logos/opl-modules/mas.svg', () => ({ default: 'mas.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mds.svg', () => ({ default: 'mds.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mag.svg', () => ({ default: 'mag.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/rca.svg', () => ({ default: 'rca.svg' }));
vi.mock('@/renderer/assets/logos/tools/coding/codex.svg', () => ({ default: 'codex.svg' }));
vi.mock('@/renderer/assets/logos/brand/hermes.svg', () => ({ default: 'hermes.svg' }));
vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'app.png' }));

import AppearanceSettings from '@/renderer/pages/settings/sections/AppearanceSettings';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import { OPL_CODEX_CONTEXT_SNIPPET, OPL_LEGACY_CODEX_CONTEXT_SNIPPETS } from '@/common/config/oplSkills';

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockResolvedValue('One Person Lab');
    mockConfigSet.mockResolvedValue(undefined);
  });

  it('keeps brand, display, and desktop pet controls on the appearance page', async () => {
    render(<AppearanceSettings />);

    expect(await screen.findByDisplayValue('One Person Lab')).toBeInTheDocument();
    expect(screen.getByTestId('opl-appearance-theme-settings')).toBeInTheDocument();
    expect(screen.getByTestId('display-settings-content')).toBeInTheDocument();
    expect(screen.getByTestId('pet-settings-content')).toBeInTheDocument();
  });
});

describe('RuntimeSettings Codex session context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnstableMessageApi.enabled = false;
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.interactionLayer') return 'codex';
      if (key === 'opl.codexSessionContext') return 'existing complete session context';
      return null;
    });
    mockConfigSet.mockResolvedValue(undefined);
    mockGetPath.mockResolvedValue('/Users/tester');
    mockReadFile.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/.codex/AGENTS.md')) return 'Codex global agents';
      if (path.endsWith('/.hermes/SOUL.md')) return 'Hermes global soul';
      return null;
    });
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
  });

  it('opens on personalization without loading the environment tab', async () => {
    render(<RuntimeSettings />);

    expect(await screen.findByText('settings.runtimePage.tabs.personalization')).toBeInTheDocument();
    expect(screen.getByText('settings.runtimePage.tabs.environment')).toBeInTheDocument();
    expect(mockRunOplCommand).not.toHaveBeenCalled();
  });

  it('loads the complete OPL App Codex session context into a single editor', async () => {
    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-context-input')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('existing complete session context');
    });
    expect(screen.queryByTestId('opl-codex-default-context-reference')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.runtimePage.sessionAddendumLoading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('effective-codex-context-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-codex-session-addendum-input')).not.toBeInTheDocument();
  });

  it('stops showing reload as busy after refreshing the session context', async () => {
    render(<RuntimeSettings />);

    const reloadButton = await screen.findByText('settings.runtimePage.actions.reloadSessionContext');
    fireEvent.click(reloadButton);

    await waitFor(() => {
      expect(reloadButton).not.toHaveAttribute('aria-busy');
    });
  });

  it('updates a saved legacy built-in context to the concise current default in the editor', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.interactionLayer') return 'codex';
      if (key === 'opl.codexSessionContext') return OPL_LEGACY_CODEX_CONTEXT_SNIPPETS[0];
      return null;
    });

    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-context-input')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe(OPL_CODEX_CONTEXT_SNIPPET);
      expect(textarea.value).not.toContain('One Person Lab is the default Codex runtime surface');
    });
  });

  it('migrates the legacy addendum into the complete context editor when no complete context is saved', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.interactionLayer') return 'codex';
      if (key === 'opl.codexSessionContext') return undefined;
      if (key === 'opl.codexSessionAddendum') return 'legacy session addendum';
      return null;
    });

    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-context-input')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('OPL App 会话补充');
      expect(textarea.value).toContain('legacy session addendum');
    });
  });

  it('saves the complete OPL App Codex session context without touching AGENTS files', async () => {
    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-context-input')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '  new complete session context  ' } });
    fireEvent.click(screen.getByText('settings.runtimePage.actions.saveSessionContext'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('opl.codexSessionContext', 'new complete session context');
    });
    expect(mockConfigSet).not.toHaveBeenCalledWith('opl.codexSessionAddendum', expect.anything());
    expect(JSON.stringify(mockConfigSet.mock.calls)).not.toContain('AGENTS.md');
  });

  it('restores the context editor to the built-in OPL default context', async () => {
    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-context-input')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'custom context' } });
    fireEvent.click(screen.getByText('settings.runtimePage.actions.restoreDefaultSessionContext'));

    await waitFor(() => {
      expect(textarea.value).toContain('OPL App 默认会话规则');
      expect(textarea.value).not.toContain('One Person Lab is the default Codex runtime surface');
      expect(textarea.value).not.toContain('custom context');
    });
  });

  it('shows only the default instruction file for the selected interaction layer', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.defaultInstructionFilesTitle'));

    await waitFor(() => {
      expect(screen.getByTestId('codex-default-instruction-file')).toHaveTextContent('Codex global agents');
    });
    expect(mockReadFile).toHaveBeenCalledWith({ path: '/Users/tester/.codex/AGENTS.md' });
    expect(mockReadFile).not.toHaveBeenCalledWith({ path: '/Users/tester/.hermes/SOUL.md' });
    expect(screen.queryByTestId('hermes-default-instruction-file')).not.toBeInTheDocument();
  });

  it('does not repeat automatic instruction file reads when the message API identity changes', async () => {
    mockUnstableMessageApi.enabled = true;

    render(<RuntimeSettings />);
    fireEvent.click(await screen.findByText('settings.runtimePage.defaultInstructionFilesTitle'));

    await waitFor(() => {
      expect(screen.getByTestId('codex-default-instruction-file')).toHaveTextContent('Codex global agents');
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('codex-default-instruction-file')).not.toHaveTextContent(
      'settings.runtimePage.defaultInstructionFilesLoading'
    );
  });

  it('switches the default instruction file when Hermes is selected', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.interactionHermes'));
    fireEvent.click(await screen.findByText('settings.runtimePage.defaultInstructionFilesTitle'));

    await waitFor(() => {
      expect(screen.getByTestId('hermes-default-instruction-file')).toHaveTextContent('Hermes global soul');
    });
    expect(mockReadFile).toHaveBeenCalledWith({ path: '/Users/tester/.hermes/SOUL.md' });
    expect(screen.queryByTestId('codex-default-instruction-file')).not.toBeInTheDocument();
  });

  it('shows an empty state when the selected instruction file is missing', async () => {
    mockReadFile.mockResolvedValue(null);

    render(<RuntimeSettings />);
    fireEvent.click(await screen.findByText('settings.runtimePage.defaultInstructionFilesTitle'));

    await waitFor(() => {
      expect(screen.getByTestId('codex-default-instruction-file')).toHaveTextContent(
        'settings.runtimePage.defaultInstructionFilesEmpty'
      );
    });
    expect(screen.getByTestId('codex-default-instruction-file')).not.toHaveTextContent(
      'settings.runtimePage.defaultInstructionFilesLoading'
    );
  });

  it('shows a load failure when the selected instruction file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('EPERM'));

    render(<RuntimeSettings />);
    fireEvent.click(await screen.findByText('settings.runtimePage.defaultInstructionFilesTitle'));

    await waitFor(() => {
      expect(screen.getByTestId('codex-default-instruction-file')).toHaveTextContent(
        'settings.runtimePage.defaultInstructionFilesLoadFailed'
      );
    });
    expect(screen.getByTestId('codex-default-instruction-file')).not.toHaveTextContent(
      'settings.runtimePage.defaultInstructionFilesLoading'
    );
  });

  it('saves Hermes as the preferred OPL interaction layer from the runtime page', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.interactionHermes'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('opl.interactionLayer', 'hermes');
      expect(mockConfigSet).toHaveBeenCalledWith('guid.lastSelectedAgent', 'hermes');
    });
  });
});
