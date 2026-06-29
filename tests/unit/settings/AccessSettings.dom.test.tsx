import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';

type AccessSettingsTestMocks = {
  configureCodexInvoke: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
};

const accessSettingsMocks = vi.hoisted<AccessSettingsTestMocks>(() => ({
  configureCodexInvoke: vi.fn(),
  load: vi.fn(),
}));

if (typeof globalThis.document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'Element', { value: dom.window.Element, configurable: true });
  Object.defineProperty(globalThis, 'Node', { value: dom.window.Node, configurable: true });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock, configurable: true });
Object.defineProperty(globalThis, 'IntersectionObserver', { value: IntersectionObserverMock, configurable: true });
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
  configurable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: (id: number) => clearTimeout(id),
  configurable: true,
});
Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, configurable: true });
Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true });

const getMocks = (): AccessSettingsTestMocks => accessSettingsMocks;

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', () => {
  const message = (text: React.ReactNode) => {
    const element = document.createElement('div');
    element.textContent = typeof text === 'string' ? text : '';
    document.body.appendChild(element);
  };

  const Button = ({
    children,
    loading: _loading,
    icon: _icon,
    type: _type,
    htmlType,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    icon?: React.ReactNode;
    type?: string;
    htmlType?: 'button' | 'submit' | 'reset';
  }) => (
    <button {...props} type={htmlType ?? 'button'}>
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
  const Tag = ({ children, color: _color, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) => (
    <span {...props}>{children}</span>
  );
  const Text = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;
  const Title = ({
    children,
    heading: _heading,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { heading?: number }) => <h2 {...props}>{children}</h2>;
  const Password = ({
    onChange,
    onPressEnter,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChange?: (value: string) => void;
    onPressEnter?: () => void;
  }) => (
    <input
      {...props}
      type='password'
      onChange={(event) => onChange?.(event.currentTarget.value)}
      onInput={(event) => onChange?.(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onPressEnter?.();
      }}
    />
  );

  return {
    Button,
    Card,
    Input: { Password },
    Message: {
      success: vi.fn(message),
      error: vi.fn(message),
    },
    Space,
    Tag,
    Typography: { Text, Title },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      configureCodex: { invoke: accessSettingsMocks.configureCodexInvoke },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => {
    return {
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
      load: accessSettingsMocks.load,
      refreshing: false,
    };
  },
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div data-testid='webui-content'>Remote access settings</div>,
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
        'settings.accessPage.cards.provider.summary': `${options?.status}`,
        'settings.accessPage.cards.provider.ready': 'Model service is reachable.',
        'settings.accessPage.cards.provider.needsAttention': 'Model service needs setup or maintenance.',
        'settings.accessPage.cards.provider.localRuntime': 'Local runtime service',
        'settings.accessPage.cards.permission.title': 'Permission Mode',
        'settings.accessPage.cards.permission.detail': 'Current command and file permissions used by the App executor.',
        'settings.accessPage.localServiceTechnicalDetail': `Technical detail: local service address ${options?.address}. Model & Account shows account/API key status.`,
        'settings.accessPage.modelAccount.title': 'Model & Account',
        'settings.accessPage.modelAccount.description':
          'Shows the current model, account/API key, model access, and permission status without exposing raw backend/provider selectors.',
        'settings.accessPage.modelAccount.apiKeyPlaceholder': 'Paste OPL Codex API key',
        'settings.accessPage.modelAccount.apiKeyRequired': 'Enter an OPL Codex API key.',
        'settings.accessPage.modelAccount.configureButton': 'Save API key',
        'settings.accessPage.modelAccount.configureSuccess': 'Codex API key saved.',
        'settings.accessPage.modelAccount.configureFailed': 'Could not save Codex API key.',
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
  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = getMocks();
    mocks.configureCodexInvoke.mockResolvedValue({
      surface: 'configure_codex',
      command: 'opl system configure-codex --api-key-stdin --json',
      stdout: '{}',
      parsed: {},
    });
    mocks.load.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders user-facing model, account, and remote access entries from the fast App state projection', () => {
    const view = render(<AccessSettingsContent />);

    expect(view.getAllByText('Model & Account')).toHaveLength(2);
    expect(
      view.getByText('Confirm model and account access, then configure Web, Docker, and remote access.')
    ).toBeTruthy();
    expect(view.getByText('Current Model')).toBeTruthy();
    expect(document.body.textContent).toContain('gpt-5.5');
    expect(document.body.textContent).not.toContain('/usr/local/bin/codex');
    expect(view.getByText('Account / API key')).toBeTruthy();
    expect(view.getByText('Account or API key is configured.')).toBeTruthy();
    expect(view.getByText('Model Access Status')).toBeTruthy();
    expect(view.getByText(/configured model service/)).toBeTruthy();
    expect(view.getByText('Model service is reachable.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('127.0.0.1:7233');
    expect(document.body.textContent).not.toContain('temporal · ready');
    expect(document.body.textContent).not.toContain('Model & Account shows account/API key status');
    expect(view.getByText('Web / Docker / Remote Access')).toBeTruthy();
    expect(view.getByText('WebUI')).toBeTruthy();
    expect(view.getByText('Docker')).toBeTruthy();
    expect(view.getByText('Remote access')).toBeTruthy();
    expect(view.getByTestId('opl-settings-codex-api-key-input')).toBeTruthy();
    expect(view.getByLabelText('opl-settings-codex-api-key-input')).toBeTruthy();
    expect(view.getByTestId('opl-settings-configure-codex-button')).toBeTruthy();
    expect(view.getByLabelText('opl-settings-configure-codex-button')).toBeTruthy();
    expect(view.getByText('Permission Mode')).toBeTruthy();
    expect(view.getByText('Full Access')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Codex CLI');
    expect(document.body.textContent).not.toContain('Access Keys');
    expect(document.body.textContent).not.toContain('Local Background Service');
    expect(document.body.textContent).not.toContain('gflabtoken');
    expect(document.body.textContent).not.toContain('settings.oplEnvironmentPage.status.full-access');

    const firstReadinessCard = view.getByText('Current Model');
    const remoteControls = view.getByTestId('webui-content');
    expect(firstReadinessCard.compareDocumentPosition(remoteControls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('saves a trimmed Codex API key through the OPL bridge, clears the input, and refreshes fast App state', async () => {
    const view = render(<AccessSettingsContent />);

    const input = view.getByTestId('opl-settings-codex-api-key-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '  sk-opl-secret-value  ' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    const mocks = getMocks();
    await waitFor(() => expect(mocks.configureCodexInvoke).toHaveBeenCalledWith({ apiKey: 'sk-opl-secret-value' }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(input.value).toBe('');
    expect(document.body.textContent).not.toContain('sk-opl-secret-value');
  });

  it('does not call the bridge when the Codex API key is empty', async () => {
    const view = render(<AccessSettingsContent />);

    fireEvent.input(view.getByTestId('opl-settings-codex-api-key-input'), { target: { value: '   ' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    const mocks = getMocks();
    expect(mocks.configureCodexInvoke).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(await view.findByText('Enter an OPL Codex API key.')).toBeTruthy();
  });
});
