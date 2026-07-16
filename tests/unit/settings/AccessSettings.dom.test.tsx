import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';
import {
  formatGatewayTokenCount,
  readGatewayAccountProjection,
  resolveDefaultGatewayGroup,
} from '@/renderer/pages/settings/accessProjection';

type AccessSettingsTestMocks = {
  configureCodexInvoke: ReturnType<typeof vi.fn>;
  loginGatewayAccountInvoke: ReturnType<typeof vi.fn>;
  executeActionInvoke: ReturnType<typeof vi.fn>;
  configGet: ReturnType<typeof vi.fn>;
  configSet: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  codexDefaultModel: string | null;
  codexModel: string | null;
  codexDefaultProfileModel: string | null;
  codexStatus: string;
  modelAccessReady: boolean;
  appStateAvailable: boolean;
  appStateLoading: boolean;
  gatewayAccount: Record<string, unknown> | null;
};

const accessSettingsMocks = vi.hoisted<AccessSettingsTestMocks>(() => ({
  configureCodexInvoke: vi.fn(),
  loginGatewayAccountInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn(),
  load: vi.fn(),
  codexDefaultModel: 'gpt-5.5',
  codexModel: null,
  codexDefaultProfileModel: 'gpt-5.4',
  codexStatus: 'ready',
  modelAccessReady: true,
  appStateAvailable: true,
  appStateLoading: false,
  gatewayAccount: null,
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

function makeGatewayAccount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    surface_kind: 'opl_gateway_account_read_model.v1',
    status: 'not_connected',
    connection_mode: 'none',
    account_card_visible: false,
    account: null,
    usage: null,
    managed_key: null,
    installation: null,
    available_groups: [],
    freshness: {
      observed_at: '2026-07-13T10:00:00+08:00',
      stale_after: '2026-07-13T10:15:00+08:00',
      stale: false,
      last_error_code: null,
    },
    capabilities: { account_login_supported: true, manual_key_supported: true },
    actions: {
      complete_setup: null,
      refresh: null,
      repair: null,
      use_for_model_access: null,
      disconnect: null,
    },
    ...overrides,
  };
}

function makeGatewayPayload(gatewayAccount: Record<string, unknown>) {
  return {
    app_state: {
      settings_control_center: {
        app_settings_read_model: {
          opl_gateway_account: gatewayAccount,
        },
      },
    },
  };
}

function makeGatewayActionResult(gatewayAccount: Record<string, unknown>) {
  return {
    surface: 'app_action',
    command: 'opl app action execute --action gateway_account_refresh --json',
    stdout: '{}',
    ok: true,
    parsed: {
      version: 'g2',
      app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1',
        action_id: 'gateway_account_refresh',
        result: { gateway_account: gatewayAccount },
      },
    },
  };
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    icon,
    type: buttonType,
    size: _size,
    status: _status,
    htmlType,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    icon?: React.ReactNode;
    type?: string;
    size?: string;
    status?: string;
    htmlType?: 'button' | 'submit' | 'reset';
  }) => (
    <button {...props} type={htmlType ?? 'button'} data-button-type={buttonType}>
      {icon}
      {children}
    </button>
  );

  const Card = ({
    children,
    bordered: _bordered,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { bordered?: boolean }) => <div {...props}>{children}</div>;
  const Modal = ({
    children,
    visible,
    title,
    footer: _footer,
    onCancel: _onCancel,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    visible?: boolean;
    title?: React.ReactNode;
    footer?: React.ReactNode;
    onCancel?: () => void;
  }) =>
    visible ? (
      <div {...props}>
        <div>{title}</div>
        {children}
      </div>
    ) : null;
  const Space = ({ children, wrap: _wrap, ...props }: React.HTMLAttributes<HTMLDivElement> & { wrap?: boolean }) => (
    <div {...props}>{children}</div>
  );
  const Tag = ({ children, color: _color, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) => (
    <span {...props}>{children}</span>
  );
  const Tooltip = ({
    children,
    content: _content,
  }: React.PropsWithChildren<{
    content?: React.ReactNode;
  }>) => <>{children}</>;
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
  const TextInput = ({
    onChange,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChange?: (value: string) => void;
  }) => (
    <input
      {...props}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      onInput={(event) => onChange?.(event.currentTarget.value)}
    />
  );
  const Input = Object.assign(TextInput, { Password });
  const Select = ({
    options = [],
    onChange,
    loading: _loading,
    ...props
  }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
    options?: Array<{ label: string; value: string }>;
    loading?: boolean;
    onChange?: (value: string) => void;
  }) => (
    <select {...props} onChange={(event) => onChange?.(event.currentTarget.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const RadioItem = ({
    children,
    value,
    onSelect,
  }: React.PropsWithChildren<{ value?: string; onSelect?: (value: string) => void }>) => (
    <label>
      <input type='radio' value={value} onChange={() => value && onSelect?.(value)} />
      {children}
    </label>
  );
  const RadioGroup = ({
    children,
    onChange,
    type: _type,
  }: React.PropsWithChildren<{ onChange?: (value: string) => void; type?: string; value?: string }>) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ onSelect?: (value: string) => void }>, {
              onSelect: onChange,
            })
          : child
      )}
    </div>
  );
  const Radio = Object.assign(RadioItem, { Group: RadioGroup });

  return {
    Button,
    Card,
    Input,
    Message: {
      success: vi.fn(message),
      error: vi.fn(message),
    },
    Modal,
    Radio,
    Select,
    Space,
    Tag,
    Tooltip,
    Typography: { Text, Title },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      configureCodex: { invoke: accessSettingsMocks.configureCodexInvoke },
      loginGatewayAccount: { invoke: accessSettingsMocks.loginGatewayAccountInvoke },
      executeAction: { invoke: accessSettingsMocks.executeActionInvoke },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: accessSettingsMocks.configGet,
    set: accessSettingsMocks.configSet,
    setLocal: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplCodexAutoModelPolicy: () => ({
    unknown_default_model_policy: 'accept_catalog_default_even_when_not_in_frontier_model_preference_order',
    unknown_model_reasoning_effort_policy: 'highest_supported_reasoning_effort_from_catalog',
    catalog_hidden_model_policy: 'exclude_hidden_models_from_auto_and_fixed_options',
    frontier_model_preference_order: ['gpt-5.6-sol', 'gpt-5.5'],
  }),
  getOplDefaultCodexModel: () => 'gpt-5.6-sol',
  getOplDefaultCodexModelDisplayLabel: () => '5.6 Sol',
  getOplDefaultCodexReasoningEffort: () => 'max',
  getOplRetiredCodexModels: () => [],
  getOplCodexModelDisplayOptions: () => ({
    auto_option: { id: '__auto', label_zh: '自动（推荐）', label_en: 'Auto (recommended)' },
    default_reasoning_effort: 'max',
    visible_models: [
      { id: 'gpt-5.6-sol', label_zh: '5.6 Sol', label_en: '5.6 Sol' },
      { id: 'gpt-5.5', label_zh: '5.5', label_en: '5.5' },
    ],
    user_reasoning_effort_options: ['high', 'max'],
    reasoning_labels: {
      high: { zh: '推理高', en: 'High reasoning' },
      max: { zh: '推理最高', en: 'Maximum reasoning' },
    },
  }),
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => {
    return {
      appState: accessSettingsMocks.appStateAvailable
        ? {
            core: {
              codex: {
                status: accessSettingsMocks.codexStatus,
                default_model: accessSettingsMocks.codexDefaultModel,
                model: accessSettingsMocks.codexModel,
                default_profile: {
                  model: accessSettingsMocks.codexDefaultProfileModel,
                },
                version: '0.125.0',
                binary_path: '/usr/local/bin/codex',
                model_access_ready: accessSettingsMocks.modelAccessReady,
                model_access_source: 'opl_gateway',
                opl_gateway_configured: true,
                config: {
                  api_key_present: true,
                },
              },
              executor: {
                permission_mode: 'full_auto',
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
            settings_control_center: {
              app_settings_read_model: {
                docker_webui: {
                  ordinary_status: 'action_available',
                  runtime_proxy: {
                    status: 'diagnose_with_doctor',
                  },
                  failure_recovery: {
                    status: 'available',
                  },
                  ordinary_next_actions: [
                    {
                      action_id: 'settings_install_docker_webui',
                      label: 'Install Docker WebUI',
                      state: 'ready',
                      route: 'opl app action execute --action settings_install_docker_webui',
                      dry_run_route: 'opl app action execute --action settings_install_docker_webui --dry-run',
                      payload_required: false,
                      confirmation_required: true,
                      danger_level: 'medium',
                    },
                    {
                      action_id: 'settings_select_webui_seed',
                      label: 'Select WebUI image seed',
                      state: 'ready',
                      route: 'opl app action execute --action settings_select_webui_seed',
                      dry_run_route: 'opl app action execute --action settings_select_webui_seed --dry-run',
                      payload_required: true,
                      confirmation_required: true,
                      danger_level: 'medium',
                    },
                    {
                      action_id: 'settings_diagnose_docker_webui',
                      label: 'Diagnose Docker WebUI',
                      state: 'ready',
                      route: 'opl app action execute --action settings_diagnose_docker_webui',
                      dry_run_route: 'opl app action execute --action settings_diagnose_docker_webui --dry-run',
                      payload_required: false,
                      confirmation_required: false,
                      danger_level: 'none',
                    },
                  ],
                },
                resource_sources: {
                  cloud_remote_access: {
                    status: 'ready',
                    resource_source_refs: ['opl://resource-source/cloud-remote-access'],
                  },
                  opl_gateway: {
                    status: 'available',
                    gateway_status_ref: 'opl://gateway/status',
                    key_status_ref: 'opl://gateway/key/gflabtoken',
                    provider_policy_ref: 'opl://gateway/policy/provider-routing',
                  },
                  opl_workspace: {
                    status: 'ready',
                    environment_ref: 'opl://environment/default',
                    storage_ref: 'opl://storage/default',
                  },
                  opl_fabric: {
                    status: 'refs_only',
                    resource_source_ref: 'opl://fabric/resource-source',
                  },
                  cloud_compute: {
                    status: 'available',
                    resource_source_ref: 'opl://resource-source/opl-cloud/managed-compute',
                    console_managed: true,
                    console_policy_ref: 'opl://console/policy/compute',
                    quota_ref: 'opl://console/quota/compute',
                    billing_ref: 'opl://console/billing/project',
                    permission_ref: 'opl://console/permission/workspace',
                    environment_template_ref: 'opl://environment-template/python-r-quarto',
                    environment_version_ref: 'opl://environment-version/python-r-quarto/2026-07',
                    task_applicability_ref: 'opl://task-applicability/mas',
                  },
                  user_hpc: {
                    status: 'available',
                    resource_source_ref: 'opl://resource-source/ssh-hpc/lab',
                    user_provided: true,
                  },
                },
                ...(accessSettingsMocks.gatewayAccount
                  ? { opl_gateway_account: accessSettingsMocks.gatewayAccount }
                  : {}),
              },
            },
          }
        : {},
      load: accessSettingsMocks.load,
      loading: accessSettingsMocks.appStateLoading,
      refreshing: false,
    };
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.accessPage.title': 'Access',
        'settings.accessPage.description': 'Check model access, Codex CLI, and local browser access.',
        'settings.accessPage.modelAccessSection.title': 'Model access and Codex',
        'settings.accessPage.modelAccessSection.description':
          'Confirm the active access source and default model before changing configuration.',
        'settings.accessPage.cards.codexCli.title': 'Codex CLI',
        'settings.accessPage.cards.codexCli.fallback': 'Codex CLI status is not available yet.',
        'settings.accessPage.cards.codexCli.version': `Installed: ${options?.version}`,
        'settings.accessPage.cards.codexCli.model': `Default model: ${options?.model}`,
        'settings.accessPage.cards.model.fallback': 'No default model was found in Codex config',
        'settings.accessPage.cards.account.title': 'Model access',
        'settings.accessPage.cards.account.configured': 'Account or API key is configured.',
        'settings.accessPage.cards.account.oplGatewayConfigured': 'OPL Gateway is connected.',
        'settings.accessPage.cards.account.existingCodexConfigured':
          'Using existing Codex model access; skipped OPL Gateway first-launch setup.',
        'settings.accessPage.cards.account.missing': 'Account or API key needs attention.',
        'settings.accessPage.cards.account.source.oplGateway': 'OPL Gateway',
        'settings.accessPage.cards.account.source.codexLogin': 'Codex / OpenAI login',
        'settings.accessPage.cards.account.source.customProvider': 'Existing model service configuration',
        'settings.accessPage.cards.account.source.envApiKey': 'Environment variable',
        'settings.accessPage.cards.modelAccess.title': 'Model Access Status',
        'settings.accessPage.cards.modelAccess.detail':
          'Checks whether the local assistant can reach the configured model service.',
        'settings.accessPage.cards.runtimeService.title': 'Background Task Service',
        'settings.accessPage.cards.runtimeService.detail':
          'Checks whether local OPL scheduling and background task services are available; implementation details may include Temporal.',
        'settings.accessPage.cards.provider.summary': `${options?.status}`,
        'settings.accessPage.cards.provider.ready': 'Background task service is available.',
        'settings.accessPage.cards.provider.needsAttention': 'Background task service needs setup or maintenance.',
        'settings.accessPage.cards.provider.localRuntime': 'Local runtime service',
        'settings.accessPage.cards.permission.title': 'Permission Mode',
        'settings.accessPage.cards.permission.detail': 'Current command and file permissions used by the App executor.',
        'settings.accessPage.localServiceTechnicalDetail': `Technical detail: local service address ${options?.address}. Model & Account shows account/API key status.`,
        'settings.accessPage.modelAccount.title': 'Model access',
        'settings.accessPage.modelAccount.keyTitle': 'OPL Gateway access key',
        'settings.accessPage.modelAccount.description':
          'Model access is connected; open configuration only when you need to replace the access key.',
        'settings.accessPage.modelAccount.showConfigButton': 'Configure OPL Gateway',
        'settings.accessPage.modelAccount.apiKeyPlaceholder': 'Paste OPL Gateway access key',
        'settings.accessPage.modelAccount.apiKeyRequired': 'Enter an OPL Gateway access key.',
        'settings.accessPage.modelAccount.configureButton': 'Configure OPL Gateway',
        'settings.accessPage.modelAccount.configureSuccess': 'OPL Gateway access key saved.',
        'settings.accessPage.modelAccount.configureFailed': 'Could not save OPL Gateway access key.',
        'settings.accessPage.gatewayAccount.title': 'OPL Gateway',
        'settings.accessPage.gatewayAccount.description':
          'Sign in to view account balance and usage, or keep using an access key.',
        'settings.accessPage.gatewayAccount.modes.account': 'Account sign-in',
        'settings.accessPage.gatewayAccount.modes.manualKey': 'Access key',
        'settings.accessPage.gatewayAccount.emailLabel': 'Gateway account email',
        'settings.accessPage.gatewayAccount.emailPlaceholder': 'Email',
        'settings.accessPage.gatewayAccount.passwordLabel': 'Gateway account password',
        'settings.accessPage.gatewayAccount.passwordPlaceholder': 'Password',
        'settings.accessPage.gatewayAccount.deviceLabel': 'Device name',
        'settings.accessPage.gatewayAccount.devicePlaceholder': 'Optional device name',
        'settings.accessPage.gatewayAccount.loginButton': 'Sign in',
        'settings.accessPage.gatewayAccount.loginSuccess': 'OPL Gateway account connected.',
        'settings.accessPage.gatewayAccount.unknownAccount': 'Gateway user',
        'settings.accessPage.gatewayAccount.status.active': 'Active',
        'settings.accessPage.gatewayAccount.status.unknown': 'Unknown',
        'settings.accessPage.gatewayAccount.status.other': `${options?.status}`,
        'settings.accessPage.gatewayAccount.metrics.balance': 'Account balance',
        'settings.accessPage.gatewayAccount.metrics.todayTokens': 'Tokens today',
        'settings.accessPage.gatewayAccount.metrics.todayCost': 'Cost today',
        'settings.accessPage.gatewayAccount.metrics.totalTokens': 'Total tokens',
        'settings.accessPage.gatewayAccount.metrics.totalCost': 'Total cost',
        'settings.accessPage.gatewayAccount.accountStatus': `Account status: ${options?.status}`,
        'settings.accessPage.gatewayAccount.balance': `Balance: ${options?.amount} ${options?.currency}`,
        'settings.accessPage.gatewayAccount.todayTokens': `Today: ${options?.value} tokens`,
        'settings.accessPage.gatewayAccount.todayCost': `Today cost: ${options?.value} ${options?.currency}`,
        'settings.accessPage.gatewayAccount.totalTokens': `Total: ${options?.value} tokens`,
        'settings.accessPage.gatewayAccount.totalCost': `Total cost: ${options?.value} ${options?.currency}`,
        'settings.accessPage.gatewayAccount.dayTimezone': `Daily boundary: ${options?.timezone}`,
        'settings.accessPage.gatewayAccount.managedKey': `Managed key: ${options?.name} · ${options?.status}`,
        'settings.accessPage.gatewayAccount.updatedAt': `Updated: ${options?.observedAt}`,
        'settings.accessPage.gatewayAccount.stale': `Showing saved data from ${options?.observedAt}.`,
        'settings.accessPage.gatewayAccount.unknownObservedAt': 'an earlier check',
        'settings.accessPage.gatewayAccount.groupPlaceholder': 'Select an access group',
        'settings.accessPage.gatewayAccount.actionSuccess': 'OPL Gateway account updated.',
        'settings.accessPage.gatewayAccount.actionFailed': 'Could not update the OPL Gateway account.',
        'settings.accessPage.gatewayAccount.disconnectConfirmTitle': 'Disconnect OPL Gateway account?',
        'settings.accessPage.gatewayAccount.disconnectConfirmDescription': 'The managed key will be disabled.',
        'settings.accessPage.gatewayAccount.actions.completeSetup': 'Complete connection',
        'settings.accessPage.gatewayAccount.actions.signInAgain': 'Sign in again',
        'settings.accessPage.gatewayAccount.actions.refresh': 'Refresh',
        'settings.accessPage.gatewayAccount.actions.repair': 'Resync',
        'settings.accessPage.gatewayAccount.actions.useForModelAccess': 'Use for model access',
        'settings.accessPage.gatewayAccount.actions.disconnect': 'Disconnect',
        'settings.accessPage.gatewayAccount.errors.invalidRequest': 'Enter the account email and password.',
        'settings.accessPage.gatewayAccount.errors.invalidCredentials': 'The email or password is incorrect.',
        'settings.accessPage.gatewayAccount.errors.authExpired': 'The Gateway session expired. Sign in again.',
        'settings.accessPage.gatewayAccount.errors.networkUnreachable':
          'The Gateway is currently unreachable. Existing data has been kept.',
        'settings.accessPage.gatewayAccount.errors.managedKeyMissing':
          'The managed key is unavailable. Refresh, then sign in again if needed.',
        'settings.accessPage.gatewayAccount.errors.managedKeyConflict': 'More than one managed key exists.',
        'settings.accessPage.gatewayAccount.errors.managedKeyIdentityDrift':
          'The managed key identity changed. Refresh, then sign in again if needed.',
        'settings.accessPage.gatewayAccount.errors.disconnectPending': 'The managed key has not been disabled yet.',
        'settings.accessPage.gatewayAccount.errors.generic': 'The OPL Gateway account operation failed.',
        'settings.accessPage.remote.title': 'Browser access to this computer',
        'settings.accessPage.remote.description':
          'Open OPL on this computer from a browser; manage the port, account, and password here.',
        'settings.accessPage.remote.webui': 'WebUI',
        'settings.accessPage.remote.docker': 'Docker WebUI',
        'settings.accessPage.remote.workspace': 'OPL Workspace',
        'settings.accessPage.remote.remoteAccess': 'Remote access',
        'settings.accessPage.remote.nativeTitle': 'Connection details',
        'settings.accessPage.remote.nativePort': 'Port: 25808',
        'settings.accessPage.remote.nativeAccount': 'Account: admin, editable in remote access settings.',
        'settings.accessPage.remote.nativePassword': 'Password: view, copy, or reset it in remote access settings.',
        'settings.accessPage.remote.openNativeSettings': 'Open remote access settings',
        'settings.accessPage.remote.openResources': 'View Resources & Connections',
        'settings.accessPage.remote.dockerTitle': 'Other resource entry points',
        'settings.accessPage.remote.dockerDescription':
          'Server WebUI, OPL Workspace, cloud, and external environments are managed in Resources & Connections.',
        'settings.accessPage.remote.actions.settings_install_docker_webui': 'Install Docker WebUI',
        'settings.accessPage.remote.actions.settings_select_webui_seed': 'Select WebUI image seed',
        'settings.accessPage.remote.actions.settings_diagnose_docker_webui': 'Diagnose Docker WebUI',
        'settings.accessPage.remote.status': `Status: ${options?.status}`,
        'settings.accessPage.remote.runtimeStatus': `Runtime proxy: ${options?.status}`,
        'settings.accessPage.remote.recoveryStatus': `Recovery: ${options?.status}`,
        'settings.accessPage.remote.showAdvancedDeployment': 'Expand',
        'settings.accessPage.remote.hideAdvancedDeployment': 'Collapse',
        'settings.accessPage.remote.runDryRoute': 'Precheck',
        'settings.accessPage.remote.payloadRequired': 'Needs input',
        'settings.accessPage.remote.payloadRequiredHelp':
          'This action needs a file or folder reference and must be started from the App action flow.',
        'settings.accessPage.remote.confirmationRequired': 'Confirms before changes',
        'settings.accessPage.remote.actionDryRunSuccess': 'Docker WebUI precheck completed.',
        'settings.accessPage.remote.actionDryRunFailed': 'Docker WebUI precheck failed.',
        'settings.accessPage.remote.noActions': 'Docker WebUI actions are not available yet.',
        'settings.accessPage.resourceSources.cloudRemoteAccess': 'Cloud & Remote Access',
        'settings.accessPage.resourceSources.oplGateway': 'OPL Gateway',
        'settings.accessPage.resourceSources.oplWorkspace': 'OPL Workspace',
        'settings.accessPage.resourceSources.oplFabric': 'OPL Fabric',
        'settings.accessPage.resourceSources.status': `Resource status: ${options?.status}`,
        'settings.accessPage.resourceSources.environmentRefs': 'Environment catalog',
        'settings.accessPage.resourceSources.managementRefs': 'OPL Console context',
        'settings.accessPage.resourceSources.categories.gateway': 'Model access',
        'settings.accessPage.resourceSources.categories.local': 'Local resource',
        'settings.accessPage.resourceSources.categories.dockerWebui': 'Docker/WebUI deployment',
        'settings.accessPage.resourceSources.categories.oplWorkspace': 'OPL Workspace',
        'settings.accessPage.resourceSources.categories.sshHpc': 'User SSH/HPC',
        'settings.accessPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud managed compute',
        'settings.accessPage.resourceSources.categories.managedStorage': 'Managed storage',
        'settings.accessPage.resourceSources.categories.institutionalData': 'Institutional data source',
        'settings.accessPage.resourceSources.categories.fabric': 'OPL Fabric',
        'settings.accessPage.resourceSources.categories.remote': 'Remote resource',
        'settings.accessPage.resourceSources.management.consoleManaged': 'Managed by OPL Console',
        'settings.accessPage.resourceSources.management.selfManaged': 'Self-managed resource',
        'settings.accessPage.resourceSources.noRefs': 'No resource context reported.',
        'settings.accessPage.statusLabels.action_available': 'Available action',
        'settings.accessPage.statusLabels.available': 'Available',
        'settings.accessPage.statusLabels.connected': 'Connected',
        'settings.accessPage.statusLabels.diagnose_with_doctor': 'Diagnostics available',
        'settings.accessPage.statusLabels.needsAttention': 'Needs attention',
        'settings.accessPage.statusLabels.ready': 'Ready',
        'settings.accessPage.statusLabels.refs_only': 'Refs only',
        'settings.accessPage.statusLabels.unknown': 'Not read',
        'settings.accessPage.actions.recheck': 'Recheck',
        'settings.accessPage.actions.fix': 'Fix issue',
        'settings.accessPage.modelPreference.autoCurrent': `Auto (current: ${options?.model})`,
        'common.cancel': 'Cancel',
        'settings.oplEnvironmentPage.status.ready': 'ready',
        'agentMode.full-access': 'Full Access',
        'agentMode.full_auto': 'Full Auto',
      };
      return labels[key] ?? options?.status ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('AccessSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = getMocks();
    mocks.codexDefaultModel = 'gpt-5.5';
    mocks.codexModel = null;
    mocks.codexDefaultProfileModel = 'gpt-5.4';
    mocks.codexStatus = 'ready';
    mocks.modelAccessReady = true;
    mocks.appStateAvailable = true;
    mocks.appStateLoading = false;
    mocks.gatewayAccount = null;
    mocks.configureCodexInvoke.mockResolvedValue({
      surface: 'configure_codex',
      command: 'opl system configure-codex --api-key-stdin --json',
      stdout: '{}',
      parsed: {},
    });
    mocks.loginGatewayAccountInvoke.mockResolvedValue({ ok: true, stateRefreshRequired: true });
    mocks.executeActionInvoke.mockResolvedValue({
      surface: 'app_action',
      command: 'opl app action execute --action settings_install_docker_webui --dry-run --json',
      stdout: '{}',
      parsed: {},
    });
    mocks.configGet.mockReturnValue({ codex: {} });
    mocks.configSet.mockResolvedValue(undefined);
    mocks.load.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('reads Gateway account state only from the canonical settings projection', () => {
    const gateway = makeGatewayAccount();
    expect(
      readGatewayAccountProjection({
        resource_sources: { opl_gateway: gateway },
        settings_control_center: { app_settings_read_model: {} },
      })
    ).toBeNull();
    expect(
      readGatewayAccountProjection({
        settings_control_center: { app_settings_read_model: { opl_gateway_account: gateway } },
      })
    ).toBe(gateway);
  });

  it('uses compact decimal token units and resolves the unique Codex group', () => {
    expect(formatGatewayTokenCount(212_960_931_822, 'en-US')).toBe('212.96B');
    expect(formatGatewayTokenCount(4_097_481_683, 'en-US')).toBe('4.1B');
    expect(formatGatewayTokenCount(null, 'en-US')).toBe('--');
    expect(
      resolveDefaultGatewayGroup([
        { group_id: 'agi', label: 'AGI' },
        { group_id: 'codex', label: 'Codex (Dedicated)' },
        { group_id: 'gemini', label: 'Gemini' },
      ])
    ).toBe('codex');
    expect(
      resolveDefaultGatewayGroup([
        { group_id: 'codex-a', label: 'Codex A' },
        { group_id: 'codex-b', label: 'Codex B' },
      ])
    ).toBeNull();
  });

  it('keeps the models surface focused on model access, Codex CLI, and conversation defaults', () => {
    const view = render(<AccessSettingsContent />);

    expect(view.getByText('Access')).toBeTruthy();
    expect(view.getByTestId('settings-models-primary')).toHaveClass('grid-cols-1', 'xl:grid-cols-2');
    expect(view.getByTestId('settings-models-codex-cli')).toHaveTextContent('Default model: gpt-5.5');
    expect(view.getByTestId('settings-models-model-preference')).toBeTruthy();
    expect(view.getByTestId('settings-models-preferred-model')).toHaveValue('__auto');
    expect(view.getByTestId('settings-models-preferred-reasoning')).toBeDisabled();
    expect(view.getByTestId('settings-models-gateway-link')).toBeTruthy();
    expect(view.queryByTestId('settings-gateway-primary')).toBeNull();
  });

  it('persists a fixed built-in model and reasoning preference for new conversations', async () => {
    const view = render(<AccessSettingsContent />);

    fireEvent.change(view.getByTestId('settings-models-preferred-model'), { target: { value: 'gpt-5.6-sol' } });
    await waitFor(() =>
      expect(getMocks().configSet).toHaveBeenCalledWith('acp.config', {
        codex: { preferredModelId: 'gpt-5.6-sol', preferredReasoningEffort: 'max' },
      })
    );

    fireEvent.change(view.getByTestId('settings-models-preferred-reasoning'), { target: { value: 'high' } });
    await waitFor(() =>
      expect(getMocks().configSet).toHaveBeenLastCalledWith('acp.config', {
        codex: { preferredModelId: 'gpt-5.6-sol', preferredReasoningEffort: 'high' },
      })
    );
  });

  it('restores the previous model selection when persistence fails', async () => {
    getMocks().configSet.mockRejectedValueOnce(new Error('write failed'));
    const view = render(<AccessSettingsContent />);

    fireEvent.change(view.getByTestId('settings-models-preferred-model'), { target: { value: 'gpt-5.6-sol' } });

    await waitFor(() => expect(view.getByTestId('settings-models-preferred-model')).toHaveValue('__auto'));
    expect(document.body.textContent).toContain('Could not save model preference.');
  });

  it('does not repeat already visible access facts in a diagnostics modal', async () => {
    const view = render(<AccessSettingsContent />);

    expect(view.queryByTestId('settings-models-technical-details')).toBeNull();
    expect(view.queryByTestId('settings-models-diagnostics-action')).toBeNull();
    expect(view.getByTestId('settings-models-codex-cli')).toHaveTextContent('gpt-5.5');
  });

  it('shows a clear Codex CLI model fallback when the default model was not read', () => {
    const mocks = getMocks();
    mocks.codexDefaultModel = null;
    mocks.codexModel = null;
    mocks.codexDefaultProfileModel = null;

    render(<AccessSettingsContent />);

    expect(document.body.textContent).toContain('Default model: No default model was found in Codex config');
  });

  it('keeps unread model access neutral instead of presenting it as an exception', () => {
    const mocks = getMocks();
    mocks.appStateAvailable = false;

    const view = render(<AccessSettingsContent />);

    expect(view.getByTestId('settings-models-model-status')).toHaveTextContent('Not read');
    expect(view.getByTestId('settings-models-model-status')).not.toHaveClass('opl-settings-status--attention');
    expect(view.getByTestId('settings-models-model-access')).not.toHaveClass('opl-settings-section--attention');
    expect(view.queryByTestId('settings-models-exception')).toBeNull();
  });

  it('does not flash the signed-out Gateway action while account state is still resolving', () => {
    const mocks = getMocks();
    mocks.appStateLoading = true;
    mocks.gatewayAccount = null;

    const view = render(<AccessSettingsContent surface='gateway' />);

    expect(view.queryByTestId('opl-settings-show-gateway-config-button')).toBeNull();
    expect(view.queryByTestId('settings-gateway-account')).toBeNull();
  });

  it('does not promote OPL Gateway configuration when only Codex CLI needs attention', () => {
    const mocks = getMocks();
    mocks.codexStatus = 'attention_required';
    mocks.modelAccessReady = true;

    const view = render(<AccessSettingsContent surface='gateway' />);

    expect(view.getByTestId('settings-gateway-primary')).not.toHaveClass('opl-settings-section--attention');
    expect(view.queryByTestId('settings-gateway-exception')).toBeNull();
    expect(view.getByTestId('opl-settings-show-gateway-config-button')).toHaveAttribute(
      'data-button-type',
      'secondary'
    );
  });

  it('saves a trimmed OPL Gateway access key through the OPL bridge, clears the input, and refreshes fast App state', async () => {
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByTestId('opl-settings-show-gateway-config-button'));
    const input = view.getByTestId('opl-settings-codex-api-key-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '  sk-opl-secret-value  ' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    const mocks = getMocks();
    await waitFor(() => expect(mocks.configureCodexInvoke).toHaveBeenCalledWith({ apiKey: 'sk-opl-secret-value' }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(input.value).toBe('');
    expect(document.body.textContent).not.toContain('sk-opl-secret-value');
  });

  it('does not report OPL Gateway configuration success when the OPL bridge returns a structured failure', async () => {
    const mocks = getMocks();
    mocks.configureCodexInvoke.mockResolvedValueOnce({
      surface: 'configure_codex',
      command: 'opl system configure-codex --api-key-stdin --json',
      stdout: '',
      parsed: null,
      ok: false,
      error: {
        message: 'configure failed',
      },
    });
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByTestId('opl-settings-show-gateway-config-button'));
    const input = view.getByTestId('opl-settings-codex-api-key-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'sk-opl-secret-value' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    await waitFor(() => expect(view.getByText('Could not save OPL Gateway access key.')).toBeTruthy());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(input.value).toBe('sk-opl-secret-value');
    expect(document.body.textContent).not.toContain('OPL Gateway access key saved.');
  });

  it('does not call the bridge when the OPL Gateway access key is empty', async () => {
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByTestId('opl-settings-show-gateway-config-button'));
    fireEvent.input(view.getByTestId('opl-settings-codex-api-key-input'), { target: { value: '   ' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    const mocks = getMocks();
    expect(mocks.configureCodexInvoke).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(await view.findByText('Enter an OPL Gateway access key.')).toBeTruthy();
  });

  it('uses the desktop-only account bridge and clears the password after a failed login', async () => {
    Object.defineProperty(window, 'electronAPI', { value: {}, configurable: true });
    const mocks = getMocks();
    mocks.gatewayAccount = makeGatewayAccount();
    mocks.loginGatewayAccountInvoke.mockResolvedValueOnce({
      ok: false,
      errorCode: 'invalid_credentials',
      stateRefreshRequired: false,
    });
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByTestId('opl-settings-show-gateway-config-button'));
    fireEvent.input(view.getByTestId('opl-settings-gateway-email-input'), {
      target: { value: ' user@example.com ' },
    });
    const password = view.getByTestId('opl-settings-gateway-password-input') as HTMLInputElement;
    fireEvent.input(password, { target: { value: 'account-secret' } });
    fireEvent.input(view.getByTestId('opl-settings-gateway-device-input'), { target: { value: 'Feng Mac' } });
    fireEvent.click(view.getByText('Sign in'));

    await waitFor(() =>
      expect(mocks.loginGatewayAccountInvoke).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'account-secret',
        deviceLabel: 'Feng Mac',
      })
    );
    await waitFor(() => expect(password.value).toBe(''));
    expect(view.getByText('The email or password is incorrect.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('account-secret');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('renders the canonical account card, preserves null metrics, and refreshes through App action', async () => {
    const mocks = getMocks();
    const gatewayAccount = makeGatewayAccount({
      status: 'connected',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 57909.35, currency: 'USD' },
      },
      usage: {
        today_tokens: null,
        total_tokens: 212960931822,
        today_actual_cost: 1.25,
        total_actual_cost: 210545.39,
        currency: 'USD',
        day_timezone: 'Asia/Shanghai',
      },
      managed_key: { name: 'OPL App · Feng-Mac · 7F31A9C2', status: 'active', ownership: 'opl_app' },
      freshness: {
        observed_at: '2026-07-13T10:00:00+08:00',
        stale_after: '2026-07-13T10:15:00+08:00',
        stale: true,
        last_error_code: 'network_unreachable',
      },
      actions: {
        complete_setup: null,
        refresh: 'gateway_account_refresh',
        repair: 'gateway_account_repair',
        use_for_model_access: 'gateway_account_use_for_model_access',
        disconnect: 'gateway_account_disconnect',
      },
    });
    const refreshedGatewayAccount = {
      ...gatewayAccount,
      freshness: {
        observed_at: '2026-07-16T03:01:00+08:00',
        stale_after: '2026-07-16T03:16:00+08:00',
        stale: false,
        last_error_code: null,
      },
    };
    mocks.gatewayAccount = gatewayAccount;
    mocks.executeActionInvoke.mockResolvedValue(makeGatewayActionResult(refreshedGatewayAccount));
    mocks.load.mockResolvedValue(makeGatewayPayload(refreshedGatewayAccount));
    const view = render(<AccessSettingsContent surface='gateway' />);

    const account = view.getByTestId('settings-gateway-account');
    const metrics = view.getByTestId('settings-gateway-metrics');
    expect(account).toHaveTextContent('feng@example.com');
    expect(account).toHaveTextContent('Active');
    expect(account.className).not.toContain('border');
    expect(metrics).toHaveTextContent('57,909.35 USD');
    expect(metrics).toHaveTextContent('212.96B');
    expect(metrics).toHaveTextContent('--');
    expect(metrics).toHaveTextContent('210,545.39 USD');
    expect(metrics.className).not.toContain('border');
    for (const testId of [
      'settings-gateway-balance-value',
      'settings-gateway-today-cost-value',
      'settings-gateway-total-cost-value',
    ]) {
      const amount = view.getByTestId(testId);
      expect(amount.className).toContain('flex-wrap');
      expect(amount.className).toContain('xl:min-h-44px');
      const stableSegments = amount.querySelectorAll('.whitespace-nowrap');
      expect(stableSegments).toHaveLength(2);
      expect(Array.from(stableSegments).every((segment) => segment.classList.contains('break-normal'))).toBe(true);
    }
    expect(account).toHaveTextContent('OPL App · Feng-Mac · 7F31A9C2');
    const stale = view.getByTestId('settings-gateway-stale');
    expect(stale.className).not.toContain('border');
    expect(view.getByTestId('settings-gateway-account-footer')).not.toHaveClass('border-t');
    expect(view.getByTestId('settings-gateway-identity-actions')).toContainElement(
      view.getByRole('button', { name: 'Disconnect' })
    );
    expect(view.getByTestId('settings-gateway-account-footer')).not.toContainElement(
      view.getByRole('button', { name: 'Disconnect' })
    );
    expect(account.querySelectorAll('.border-t')).toHaveLength(0);
    expect(view.queryByTestId('opl-settings-show-gateway-config-button')).toBeNull();
    expect(view.queryByText('Resync')).toBeNull();
    expect(view.queryByText('Use for model access')).toBeNull();
    expect(document.body.textContent).not.toContain('Asia/Shanghai');
    expect(document.body.textContent).not.toContain('2026-07-13T10:00:00+08:00');

    const refreshButton = view.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toHaveTextContent('');
    expect(refreshButton.querySelector('svg')).not.toBeNull();
    fireEvent.click(refreshButton);
    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'gateway_account_refresh',
        dryRun: false,
      })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    await waitFor(() => expect(document.body.textContent).toContain('OPL Gateway account updated.'));
  });

  it('keeps cached Gateway data and rejects a refresh success toast when the action reports a typed failure', async () => {
    const mocks = getMocks();
    const gatewayAccount = makeGatewayAccount({
      status: 'connected',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 57909.35, currency: 'USD' },
      },
      usage: {
        today_tokens: 751760000,
        total_tokens: 215730000000,
        today_actual_cost: 1.25,
        total_actual_cost: 210545.39,
        currency: 'USD',
        day_timezone: 'Asia/Shanghai',
      },
      freshness: {
        observed_at: '2026-07-16T03:01:00+08:00',
        stale_after: '2026-07-16T03:01:00+08:00',
        stale: true,
        last_error_code: 'network_unreachable',
      },
      actions: {
        complete_setup: null,
        refresh: 'gateway_account_refresh',
        repair: 'gateway_account_repair',
        use_for_model_access: 'gateway_account_use_for_model_access',
        disconnect: 'gateway_account_disconnect',
      },
    });
    mocks.gatewayAccount = gatewayAccount;
    mocks.executeActionInvoke.mockResolvedValue(makeGatewayActionResult(gatewayAccount));
    mocks.load.mockResolvedValue(makeGatewayPayload(gatewayAccount));
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('The Gateway is currently unreachable. Existing data has been kept.')
    );
    expect(view.getByTestId('settings-gateway-account')).toHaveTextContent('feng@example.com');
    expect(view.getByTestId('settings-gateway-metrics')).toHaveTextContent('57,909.35 USD');
    expect(document.body.textContent).not.toContain('OPL Gateway account updated.');
  });

  it('does not run Gateway setup while only the models surface is open', () => {
    const mocks = getMocks();
    mocks.gatewayAccount = makeGatewayAccount({
      status: 'setup_required',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 1, currency: 'CNY' },
      },
      available_groups: [{ group_id: 'group-codex', label: 'Codex' }],
      actions: {
        complete_setup: 'gateway_account_complete_setup',
        refresh: null,
        repair: null,
        use_for_model_access: null,
        disconnect: 'gateway_account_disconnect',
      },
    });

    render(<AccessSettingsContent />);

    expect(mocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('automatically completes an exposed managed-Key setup action without rendering a control', async () => {
    const mocks = getMocks();
    mocks.gatewayAccount = makeGatewayAccount({
      status: 'attention_needed',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 1, currency: 'CNY' },
      },
      available_groups: [
        { group_id: 'group-agi', label: 'AGI' },
        { group_id: 'group-codex', label: 'Codex (Dedicated)' },
        { group_id: 'group-gemini', label: 'Gemini' },
      ],
      actions: {
        complete_setup: 'gateway_account_complete_setup',
        refresh: null,
        repair: null,
        use_for_model_access: null,
        disconnect: 'gateway_account_disconnect',
      },
    });
    const view = render(<AccessSettingsContent surface='gateway' />);
    expect(view.queryByRole('combobox', { name: /group/i })).toBeNull();
    expect(view.queryByText('Complete connection')).toBeNull();

    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'gateway_account_complete_setup',
        dryRun: false,
        payloadJson: { group_id: 'group-codex' },
      })
    );
  });

  it('does not loop automatic setup when the projected action fails', async () => {
    const mocks = getMocks();
    mocks.executeActionInvoke.mockRejectedValueOnce(new Error('offline'));
    mocks.gatewayAccount = makeGatewayAccount({
      status: 'setup_required',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 1, currency: 'CNY' },
      },
      available_groups: [{ group_id: 'group-codex', label: 'Codex' }],
      actions: {
        complete_setup: 'gateway_account_complete_setup',
        refresh: null,
        repair: null,
        use_for_model_access: null,
        disconnect: 'gateway_account_disconnect',
      },
    });

    const view = render(<AccessSettingsContent surface='gateway' />);

    await waitFor(() => expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByText('Could not update the OPL Gateway account.')).toBeTruthy());
    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before disconnecting the managed account', () => {
    const mocks = getMocks();
    mocks.gatewayAccount = makeGatewayAccount({
      status: 'connected',
      connection_mode: 'account',
      account_card_visible: true,
      account: {
        display_name: 'Feng',
        email: 'feng@example.com',
        status: 'active',
        balance: { amount: 1, currency: 'CNY' },
      },
      actions: {
        complete_setup: null,
        refresh: null,
        repair: null,
        use_for_model_access: null,
        disconnect: 'gateway_account_disconnect',
      },
    });
    const view = render(<AccessSettingsContent surface='gateway' />);

    fireEvent.click(view.getByText('Disconnect'));

    expect(view.getByTestId('settings-gateway-disconnect-confirm')).toBeTruthy();
    expect(mocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it.each([
    ['reauth_required', 'auth_expired', 'The Gateway session expired. Sign in again.'],
    [
      'attention_needed',
      'managed_key_missing',
      'The managed key is unavailable. Refresh, then sign in again if needed.',
    ],
    ['attention_needed', 'managed_key_conflict', 'More than one managed key exists.'],
    [
      'attention_needed',
      'managed_key_identity_drift',
      'The managed key identity changed. Refresh, then sign in again if needed.',
    ],
    ['disconnect_pending', 'disconnect_pending', 'The managed key has not been disabled yet.'],
  ])('maps %s / %s to stable user-facing guidance', (status, errorCode, expected) => {
    const mocks = getMocks();
    mocks.gatewayAccount = makeGatewayAccount({
      status,
      connection_mode: 'account',
      freshness: {
        observed_at: '2026-07-13T10:00:00+08:00',
        stale_after: '2026-07-13T10:15:00+08:00',
        stale: false,
        last_error_code: errorCode,
      },
    });

    const view = render(<AccessSettingsContent surface='gateway' />);

    expect(view.getByText(expected)).toBeTruthy();
  });
});
