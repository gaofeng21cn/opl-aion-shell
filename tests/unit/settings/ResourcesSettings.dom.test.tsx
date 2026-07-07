import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { ResourcesSettingsContent } from '@/renderer/pages/settings/sections/ResourcesSettings';

const resourcesSettingsMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
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

const getMocks = () => resourcesSettingsMocks;

const openDetailsFor = (summary: HTMLElement) => {
  const details = summary.closest('details') as HTMLDetailsElement | null;
  expect(details).toBeTruthy();
  if (!details) return;
  details.open = true;
  fireEvent(details, new Event('toggle'));
};

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

  return {
    Button,
    Card,
    Message: {
      success: vi.fn(message),
      error: vi.fn(message),
    },
    Space,
    Tag,
    Tooltip,
    Typography: { Text, Title },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: resourcesSettingsMocks.executeActionInvoke },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      core: {
        codex: {
          config: { api_key_present: true },
        },
      },
      settings_control_center: {
        app_settings_read_model: {
          docker_webui: {
            ordinary_status: 'action_available',
            runtime_proxy: { status: 'ready' },
            failure_recovery: { status: 'available' },
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
            ],
          },
          resource_sources: {
            cloud_remote_access: {
              status: 'ready',
              resource_source_refs: ['opl://resource-source/cloud-remote-access'],
            },
            opl_workspace: {
              status: 'ready',
              environment_ref: 'opl://environment/default',
              storage_ref: 'opl://storage/default',
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
            },
          },
        },
      },
    },
    load: resourcesSettingsMocks.load,
    refreshing: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.resourcesPage.title': 'Resources & Connections',
        'settings.resourcesPage.description':
          'Connect server WebUI, OPL Workspace, cloud or hosted workspaces, and external environments here.',
        'settings.resourcesPage.docker.title': 'Server WebUI and OPL Workspace',
        'settings.resourcesPage.docker.description':
          'Use these entries for server or hosted workspace deployments. Local browser access stays on Access.',
        'settings.resourcesPage.docker.docker': 'Server WebUI',
        'settings.resourcesPage.docker.workspace': 'OPL Workspace',
        'settings.resourcesPage.docker.runDryRoute': 'Check before deploy',
        'settings.resourcesPage.docker.payloadRequired': 'Needs details',
        'settings.resourcesPage.docker.confirmationRequired': 'Confirms before changes',
        'settings.resourcesPage.docker.actionDryRunSuccess': 'Deployment check completed.',
        'settings.resourcesPage.docker.actionDryRunFailed': 'Deployment check failed.',
        'settings.resourcesPage.docker.actions.settings_install_docker_webui': 'Install server WebUI',
        'settings.resourcesPage.docker.actions.settings_select_webui_seed': 'Choose initial WebUI image',
        'settings.resourcesPage.connections.title': 'Cloud, workspace, and external resources',
        'settings.resourcesPage.connections.description':
          'Shows cloud, workspace, and external environments tasks can use. Technical references stay collapsed.',
        'settings.resourcesPage.statusLabels.action_available': 'Available action',
        'settings.resourcesPage.statusLabels.available': 'Available',
        'settings.resourcesPage.statusLabels.ready': 'Ready',
        'settings.resourcesPage.resourceSources.status': `Resource status: ${options?.status}`,
        'settings.resourcesPage.resourceSources.environmentRefs': 'Has environment config',
        'settings.resourcesPage.resourceSources.managementRefs': 'Has management info',
        'settings.resourcesPage.resourceSources.technicalRefs': 'Technical references',
        'settings.resourcesPage.resourceSources.categories.remote': 'Remote resource',
        'settings.resourcesPage.resourceSources.categories.oplWorkspace': 'OPL Workspace',
        'settings.resourcesPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud managed compute',
        'settings.resourcesPage.resourceSources.management.consoleManaged': 'Managed by OPL Console',
        'settings.resourcesPage.resourceSources.noRefs': 'No resource context reported.',
        'settings.accessPage.resourceSources.cloudRemoteAccess': 'Cloud & Remote Access',
        'settings.accessPage.resourceSources.oplWorkspace': 'OPL Workspace',
        'settings.accessPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud managed compute',
      };
      return labels[key] ?? options?.status ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('ResourcesSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMocks().executeActionInvoke.mockResolvedValue({
      surface: 'app_action',
      command: 'opl app action execute --action settings_install_docker_webui --dry-run --json',
      stdout: '{}',
      parsed: {},
    });
    getMocks().load.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders Docker WebUI, OPL Workspace, cloud, and external resource connections outside Access', () => {
    const view = render(<ResourcesSettingsContent />);

    expect(view.getByText('Resources & Connections')).toBeTruthy();
    expect(view.getByText('Server WebUI and OPL Workspace')).toBeTruthy();
    expect(view.getAllByText('Server WebUI').length).toBeGreaterThan(0);
    expect(view.getAllByText('OPL Workspace').length).toBeGreaterThan(0);
    expect(view.getByText('Install server WebUI')).toBeTruthy();
    expect(view.getByText('Choose initial WebUI image')).toBeTruthy();
    expect(view.getByTestId('opl-settings-resource-sources')).toBeTruthy();
    expect(document.body.textContent).not.toContain('opl app action execute --action');
    expect(document.body.textContent).toContain('Managed by OPL Console');
    expect(document.body.textContent).toContain('OPL Cloud managed compute');
    expect(document.body.textContent).toContain('Has management info');
    expect(document.body.textContent).toContain('Has environment config');
    expect(document.body.textContent).toContain('Technical references');
    expect(document.body.textContent).not.toContain('opl://resource-source/cloud-remote-access');
    expect(document.body.textContent).not.toContain('opl://environment/default');
    expect(document.body.textContent).not.toContain('opl://storage/default');

    view.getAllByText('Technical references').forEach((summary) => openDetailsFor(summary));

    expect(document.body.textContent).toContain('opl://resource-source/cloud-remote-access');
    expect(document.body.textContent).toContain('opl://environment/default');
    expect(document.body.textContent).toContain('opl://storage/default');
    expect(document.body.textContent).toContain('opl://console/policy/compute');
    expect(document.body.textContent).toContain('opl://console/quota/compute');
    expect(document.body.textContent).toContain('opl://console/billing/project');
    expect(document.body.textContent).toContain('opl://console/permission/workspace');
    expect(document.body.textContent).toContain('opl://environment-template/python-r-quarto');
  });

  it('checks Docker WebUI ordinary action routes through the App control-plane action bridge', async () => {
    const view = render(<ResourcesSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_install_docker_webui'));

    const mocks = getMocks();
    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_install_docker_webui',
        dryRun: true,
      })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(await view.findByText('Deployment check completed.')).toBeTruthy();
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
    const view = render(<ResourcesSettingsContent />);

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_install_docker_webui'));

    await waitFor(() => expect(view.getByText('Deployment check failed.')).toBeTruthy());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Deployment check completed.');
  });

  it('does not invent shell-local input for Docker WebUI actions that require payload refs', () => {
    const view = render(<ResourcesSettingsContent />);

    const seedAction = view.getByTestId('opl-settings-docker-webui-action-settings_select_webui_seed');
    expect(seedAction).toHaveAttribute('disabled');
    expect(seedAction.textContent).toContain('Needs details');
    fireEvent.click(seedAction);

    expect(getMocks().executeActionInvoke).not.toHaveBeenCalled();
  });
});
