import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';

type AccessSettingsTestMocks = {
  configureCodexInvoke: ReturnType<typeof vi.fn>;
  executeActionInvoke: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  codexModel: string | null;
};

const accessSettingsMocks = vi.hoisted<AccessSettingsTestMocks>(() => ({
  configureCodexInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  load: vi.fn(),
  codexModel: 'gpt-5.5',
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({
  default: () => <div>Native remote settings</div>,
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

  return {
    Button,
    Card,
    Input: { Password },
    Message: {
      success: vi.fn(message),
      error: vi.fn(message),
    },
    Modal,
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
      executeAction: { invoke: accessSettingsMocks.executeActionInvoke },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => {
    return {
      appState: {
        core: {
          codex: {
            status: 'ready',
            model: accessSettingsMocks.codexModel,
            version: '0.125.0',
            binary_path: '/usr/local/bin/codex',
            model_access_ready: true,
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
          },
        },
      },
      load: accessSettingsMocks.load,
      refreshing: false,
    };
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.accessPage.title': 'Access',
        'settings.accessPage.description': 'Check model access, background task service, and remote entries.',
        'settings.accessPage.cards.codexCli.title': 'Codex CLI',
        'settings.accessPage.cards.codexCli.fallback': 'Codex CLI status is not available yet.',
        'settings.accessPage.cards.codexCli.version': `Installed: ${options?.version}`,
        'settings.accessPage.cards.codexCli.model': `Current model: ${options?.model}`,
        'settings.accessPage.cards.model.fallback': 'not read',
        'settings.accessPage.cards.account.title': 'OPL Gateway',
        'settings.accessPage.cards.account.configured': 'Account or API key is configured.',
        'settings.accessPage.cards.account.oplGatewayConfigured': 'OPL Gateway is connected.',
        'settings.accessPage.cards.account.existingCodexConfigured':
          'Using existing Codex model access; skipped OPL Gateway first-launch setup.',
        'settings.accessPage.cards.account.missing': 'Account or API key needs attention.',
        'settings.accessPage.cards.account.source.oplGateway': 'Currently using OPL Gateway.',
        'settings.accessPage.cards.account.source.codexLogin': 'From Codex/OpenAI login.',
        'settings.accessPage.cards.account.source.customProvider': 'From an existing provider configuration.',
        'settings.accessPage.cards.account.source.envApiKey': 'From an environment variable.',
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
        'settings.accessPage.modelAccount.title': 'OPL Gateway',
        'settings.accessPage.modelAccount.description':
          'This machine is using OPL Gateway for model access; open configuration only when you need to replace the access key.',
        'settings.accessPage.modelAccount.showConfigButton': 'Configure access key',
        'settings.accessPage.modelAccount.apiKeyPlaceholder': 'Paste OPL Gateway access key',
        'settings.accessPage.modelAccount.apiKeyRequired': 'Enter an OPL Gateway access key.',
        'settings.accessPage.modelAccount.configureButton': 'Configure OPL Gateway',
        'settings.accessPage.modelAccount.configureSuccess': 'OPL Gateway access key saved.',
        'settings.accessPage.modelAccount.configureFailed': 'Could not save OPL Gateway access key.',
        'settings.accessPage.remote.title': 'Web & Remote Access',
        'settings.accessPage.remote.description':
          'Remote access lets you open OPL on this computer from a browser; manage the port, account, and password here.',
        'settings.accessPage.remote.webui': 'WebUI',
        'settings.accessPage.remote.docker': 'Docker WebUI',
        'settings.accessPage.remote.workspace': 'OPL Workspace',
        'settings.accessPage.remote.remoteAccess': 'Remote access',
        'settings.accessPage.remote.nativeTitle': 'Local remote access',
        'settings.accessPage.remote.nativePort': 'Port: 25808',
        'settings.accessPage.remote.nativeAccount': 'Account: admin, editable in remote access settings.',
        'settings.accessPage.remote.nativePassword': 'Password: view, copy, or reset it in remote access settings.',
        'settings.accessPage.remote.openNativeSettings': 'Open remote access settings',
        'settings.accessPage.remote.dockerTitle': 'Advanced deployment',
        'settings.accessPage.remote.dockerDescription':
          'Docker WebUI / OPL Workspace is for server or hosted workspace deployments. To open this computer from a browser, use local remote access first.',
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
        'settings.accessPage.statusLabels.diagnose_with_doctor': 'Diagnostics available',
        'settings.accessPage.statusLabels.ready': 'Ready',
        'settings.accessPage.statusLabels.refs_only': 'Refs only',
        'settings.accessPage.actions.recheck': 'Recheck',
        'settings.accessPage.actions.fix': 'Fix issue',
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
    mocks.codexModel = 'gpt-5.5';
    mocks.configureCodexInvoke.mockResolvedValue({
      surface: 'configure_codex',
      command: 'opl system configure-codex --api-key-stdin --json',
      stdout: '{}',
      parsed: {},
    });
    mocks.executeActionInvoke.mockResolvedValue({
      surface: 'app_action',
      command: 'opl app action execute --action settings_install_docker_webui --dry-run --json',
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

    expect(view.getByText('Access')).toBeTruthy();
    expect(view.getAllByText('OPL Gateway').length).toBeGreaterThan(0);
    expect(view.getByText('Check model access, background task service, and remote entries.')).toBeTruthy();
    expect(view.getByText('Codex CLI')).toBeTruthy();
    expect(document.body.textContent).toContain('Installed: 0.125.0');
    expect(document.body.textContent).toContain('Current model: gpt-5.5');
    expect(document.body.textContent).not.toContain('/usr/local/bin/codex');
    expect(document.body.textContent).not.toContain('OPL Gateway is connected.');
    expect(document.body.textContent).not.toContain('Currently using OPL Gateway.');
    expect(view.getByText('Background Task Service')).toBeTruthy();
    expect(view.getByText(/local OPL scheduling/)).toBeTruthy();
    expect(view.getByText('Background task service is available.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Model service is reachable.');
    expect(document.body.textContent).not.toContain('127.0.0.1:7233');
    expect(document.body.textContent).not.toContain('temporal · ready');
    expect(document.body.textContent).not.toContain('Model & Account shows account/API key status');
    expect(document.body.textContent).not.toContain('Fix issue');
    expect(view.getByText('Web & Remote Access')).toBeTruthy();
    expect(view.getByText('Local remote access')).toBeTruthy();
    expect(view.getByText('Port: 25808')).toBeTruthy();
    expect(view.getByText('Account: admin, editable in remote access settings.')).toBeTruthy();
    expect(view.getByText('Password: view, copy, or reset it in remote access settings.')).toBeTruthy();
    expect(view.getByTestId('opl-settings-open-native-remote-settings')).toBeTruthy();
    expect(view.getByText('Advanced deployment')).toBeTruthy();
    expect(view.getByText('WebUI')).toBeTruthy();
    expect(view.getByText('Docker WebUI')).toBeTruthy();
    expect(view.getAllByText('OPL Workspace').length).toBeGreaterThan(0);
    expect(view.getByText('Remote access')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Status: action_available');
    expect(document.body.textContent).not.toContain('Runtime proxy: diagnose_with_doctor');
    expect(document.body.textContent).not.toContain('Recovery: available');
    expect(document.body.textContent).not.toContain('action_available');
    expect(document.body.textContent).not.toContain('diagnose_with_doctor');
    expect(document.body.textContent).not.toContain('Recovery: available');
    expect(document.body.textContent).not.toContain('Install Docker WebUI');
    expect(document.body.textContent).not.toContain('Select WebUI image seed');
    expect(document.body.textContent).not.toContain('Diagnose Docker WebUI');
    expect(view.queryByTestId('opl-settings-docker-webui-route-settings_install_docker_webui')).toBeNull();
    expect(view.queryByTestId('opl-settings-resource-sources')).toBeNull();
    fireEvent.click(view.getByTestId('opl-settings-toggle-advanced-deployment'));
    expect(view.getByText('Install Docker WebUI')).toBeTruthy();
    expect(view.getByText('Select WebUI image seed')).toBeTruthy();
    expect(view.getByText('Diagnose Docker WebUI')).toBeTruthy();
    expect(view.getByTestId('opl-settings-docker-webui-route-settings_install_docker_webui')).toBeTruthy();
    expect(view.getByTestId('opl-settings-docker-webui-route-settings_select_webui_seed')).toBeTruthy();
    expect(view.getByTestId('opl-settings-resource-sources')).toBeTruthy();
    expect(view.getByText('Cloud & Remote Access')).toBeTruthy();
    expect(view.getAllByText('OPL Gateway').length).toBeGreaterThan(0);
    expect(view.getAllByText('OPL Workspace').length).toBeGreaterThan(0);
    expect(view.getAllByText('OPL Fabric').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('opl://resource-source/cloud-remote-access');
    expect(document.body.textContent).toContain('opl://gateway/status');
    expect(document.body.textContent).toContain('opl://gateway/key/gflabtoken');
    expect(document.body.textContent).toContain('opl://gateway/policy/provider-routing');
    expect(document.body.textContent).toContain('opl://environment/default');
    expect(document.body.textContent).toContain('opl://storage/default');
    expect(document.body.textContent).toContain('opl://fabric/resource-source');
    expect(document.body.textContent).toContain('Managed by OPL Console');
    expect(document.body.textContent).toContain('Self-managed resource');
    expect(document.body.textContent).toContain('OPL Cloud managed compute');
    expect(document.body.textContent).toContain('User SSH/HPC');
    expect(document.body.textContent).toContain('OPL Console context');
    expect(document.body.textContent).toContain('Environment catalog');
    expect(document.body.textContent).toContain('opl://console/policy/compute');
    expect(document.body.textContent).toContain('opl://console/quota/compute');
    expect(document.body.textContent).toContain('opl://console/billing/project');
    expect(document.body.textContent).toContain('opl://console/permission/workspace');
    expect(document.body.textContent).toContain('opl://environment-template/python-r-quarto');
    expect(document.body.textContent).toContain('opl://environment-version/python-r-quarto/2026-07');
    expect(document.body.textContent).toContain('opl://task-applicability/mas');
    expect(document.body.textContent).toContain('opl://resource-source/ssh-hpc/lab');
    expect(view.queryByTestId('opl-settings-codex-api-key-input')).toBeNull();
    expect(view.getByTestId('opl-settings-show-gateway-config-button')).toBeTruthy();
    expect(view.getByText('Permission Mode')).toBeTruthy();
    expect(view.getByText('Full Auto')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Access Keys');
    expect(document.body.textContent).not.toContain('Local Background Service');
    expect(document.body.textContent).not.toContain('settings.oplEnvironmentPage.status.full-access');

    const firstReadinessCard = view.getByText('Codex CLI');
    const remoteControls = view.getByTestId('opl-settings-docker-webui-route-settings_install_docker_webui');
    expect(firstReadinessCard.compareDocumentPosition(remoteControls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows a clear Codex CLI model fallback when the current model was not read', () => {
    const mocks = getMocks();
    mocks.codexModel = null;

    render(<AccessSettingsContent />);

    expect(document.body.textContent).toContain('Current model: not read');
  });

  it('saves a trimmed OPL Gateway access key through the OPL bridge, clears the input, and refreshes fast App state', async () => {
    const view = render(<AccessSettingsContent />);

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
    const view = render(<AccessSettingsContent />);

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
    const view = render(<AccessSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-show-gateway-config-button'));
    fireEvent.input(view.getByTestId('opl-settings-codex-api-key-input'), { target: { value: '   ' } });
    fireEvent.click(view.getByTestId('opl-settings-configure-codex-button'));

    const mocks = getMocks();
    expect(mocks.configureCodexInvoke).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(await view.findByText('Enter an OPL Gateway access key.')).toBeTruthy();
  });

  it('checks Docker WebUI ordinary action routes through the App control-plane action bridge', async () => {
    const view = render(<AccessSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-toggle-advanced-deployment'));
    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_install_docker_webui'));

    const mocks = getMocks();
    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_install_docker_webui',
        dryRun: true,
      })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(await view.findByText('Docker WebUI precheck completed.')).toBeTruthy();
  });

  it('does not report Docker WebUI action success when the App control-plane bridge returns a structured failure', async () => {
    const mocks = getMocks();
    mocks.executeActionInvoke.mockResolvedValueOnce({
      surface: 'app_action',
      command: 'opl app action execute --action settings_install_docker_webui --dry-run --json',
      stdout: '',
      parsed: null,
      ok: false,
      error: {
        message: 'route failed',
      },
    });
    const view = render(<AccessSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-toggle-advanced-deployment'));
    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_install_docker_webui'));

    await waitFor(() => expect(view.getByText('Docker WebUI precheck failed.')).toBeTruthy());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Docker WebUI precheck completed.');
  });

  it('does not invent shell-local input for Docker WebUI actions that require payload refs', () => {
    const view = render(<AccessSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-toggle-advanced-deployment'));
    const seedAction = view.getByTestId('opl-settings-docker-webui-action-settings_select_webui_seed');
    expect(seedAction).toHaveAttribute('disabled');
    expect(seedAction.textContent).toContain('Needs input');
    fireEvent.click(seedAction);

    expect(getMocks().executeActionInvoke).not.toHaveBeenCalled();
  });
});
