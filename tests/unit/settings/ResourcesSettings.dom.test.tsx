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
                action_id: 'settings_configure_webui_api_key',
                label: 'Configure WebUI API key',
                state: 'attention_needed',
                route: 'opl app action execute --action settings_configure_webui_api_key',
                dry_run_route: 'opl app action execute --action settings_configure_webui_api_key --dry-run',
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
              {
                action_id: 'settings_open_docker_webui',
                label: 'Open Docker WebUI',
                state: 'ready',
                route: 'opl app action execute --action settings_open_docker_webui',
                dry_run_route: 'opl app action execute --action settings_open_docker_webui --dry-run',
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
        'settings.resourcesPage.title': '资源与连接',
        'settings.resourcesPage.description': '管理浏览器 WebUI、OPL Workspace、云端/托管工作区和外部环境连接。',
        'settings.resourcesPage.docker.title': 'WebUI 与 OPL Workspace',
        'settings.resourcesPage.docker.description':
          '桌面 App 已内置本机工作台；这里显示浏览器 WebUI、服务器/托管工作区的打开、检查和维护入口。',
        'settings.resourcesPage.docker.docker': 'WebUI',
        'settings.resourcesPage.docker.workspace': 'OPL Workspace',
        'settings.resourcesPage.docker.primaryActionTitle': '可用操作',
        'settings.resourcesPage.docker.runDryRoute': '继续设置',
        'settings.resourcesPage.docker.openResource': '打开资源',
        'settings.resourcesPage.docker.recheck': '重新检查',
        'settings.resourcesPage.docker.prepareEnvironment': '准备部署',
        'settings.resourcesPage.docker.payloadRequired': '需要填写信息',
        'settings.resourcesPage.docker.payloadRequiredHelp': '这个操作需要先选择文件或填写配置。',
        'settings.resourcesPage.docker.confirmationRequired': '变更前确认',
        'settings.resourcesPage.docker.moreActions': '更多操作',
        'settings.resourcesPage.docker.technicalDetails': '高级详情',
        'settings.resourcesPage.docker.technicalState': '原始状态',
        'settings.resourcesPage.docker.technicalActionId': '动作 ID',
        'settings.resourcesPage.docker.technicalCommand': '命令',
        'settings.resourcesPage.docker.technicalPreviewCommand': '预检查命令',
        'settings.resourcesPage.docker.actionDryRunSuccess': '部署前检查完成。',
        'settings.resourcesPage.docker.actionDryRunFailed': '部署前检查失败。',
        'settings.resourcesPage.docker.actions.settings_install_docker_webui': '准备服务器/托管 WebUI',
        'settings.resourcesPage.docker.actions.settings_configure_webui_api_key': '配置 WebUI 模型访问',
        'settings.resourcesPage.docker.actions.settings_select_webui_seed': '选择 WebUI 镜像或模板',
        'settings.resourcesPage.docker.actions.settings_diagnose_docker_webui': '检查 WebUI 状态',
        'settings.resourcesPage.docker.actions.settings_open_docker_webui': '打开 WebUI',
        'settings.resourcesPage.connections.title': '云端与外部环境',
        'settings.resourcesPage.connections.description':
          '展示任务可以使用的云端、工作区和外部环境；技术引用默认收起。',
        'settings.resourcesPage.connections.workspaceTitle': 'OPL Workspace',
        'settings.resourcesPage.connections.workspaceDescription':
          '确认任务使用的工作区、环境和存储入口；底层引用默认收起。',
        'settings.resourcesPage.statusLabels.action_available': '可用',
        'settings.resourcesPage.statusLabels.available': '可用',
        'settings.resourcesPage.statusLabels.attention_required': '需要检查',
        'settings.resourcesPage.statusLabels.needs_input': '需要填写信息',
        'settings.resourcesPage.statusLabels.ready': '可用',
        'settings.resourcesPage.resourceSources.environmentRefs': '有环境配置',
        'settings.resourcesPage.resourceSources.managementRefs': '有管理信息',
        'settings.resourcesPage.resourceSources.technicalRefs': '技术引用',
        'settings.resourcesPage.resourceSources.categories.remote': '远程资源',
        'settings.resourcesPage.resourceSources.categories.oplWorkspace': 'OPL Workspace',
        'settings.resourcesPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud 托管计算',
        'settings.resourcesPage.resourceSources.management.consoleManaged': '由 OPL Console 管理',
        'settings.resourcesPage.resourceSources.noRefs': '未报告资源上下文。',
        'settings.accessPage.resourceSources.cloudRemoteAccess': '云端与远程访问',
        'settings.accessPage.resourceSources.oplWorkspace': 'OPL Workspace',
        'settings.accessPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud 托管计算',
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

  it('renders action-oriented resource groups without exposing raw control-plane details by default', () => {
    const view = render(<ResourcesSettingsContent />);

    expect(view.getByText('资源与连接')).toBeTruthy();
    expect(view.getByText('WebUI 与 OPL Workspace')).toBeTruthy();
    expect(view.getAllByText('WebUI').length).toBeGreaterThan(0);
    expect(view.getAllByText('OPL Workspace').length).toBeGreaterThan(0);
    expect(view.getByText('云端与外部环境')).toBeTruthy();
    expect(view.getByText('可用操作')).toBeTruthy();
    expect(view.getByText('打开 WebUI')).toBeTruthy();
    expect(view.queryByText('准备服务器/托管 WebUI')).toBeNull();
    expect(view.queryByText('配置 WebUI 模型访问')).toBeNull();
    expect(view.queryByText('选择 WebUI 镜像或模板')).toBeNull();
    expect(view.getByText('更多操作')).toBeTruthy();
    expect(view.getByTestId('opl-settings-workspace-resource-sources')).toBeTruthy();
    expect(view.getByTestId('opl-settings-resource-sources')).toBeTruthy();
    expect(document.body.textContent).not.toContain('opl app action execute --action');
    expect(document.body.textContent).not.toContain('dry-run');
    expect(document.body.textContent).not.toContain('payload');
    expect(document.body.textContent).not.toContain('attention_needed');
    expect(document.body.textContent).toContain('由 OPL Console 管理');
    expect(document.body.textContent).toContain('OPL Cloud 托管计算');
    expect(document.body.textContent).toContain('有管理信息');
    expect(document.body.textContent).toContain('有环境配置');
    expect(document.body.textContent).toContain('技术引用');
    expect(document.body.textContent).not.toContain('opl://resource-source/cloud-remote-access');
    expect(document.body.textContent).not.toContain('opl://environment/default');
    expect(document.body.textContent).not.toContain('opl://storage/default');

    openDetailsFor(view.getByText('更多操作'));
    expect(view.getByText('准备服务器/托管 WebUI')).toBeTruthy();
    expect(view.getByText('配置 WebUI 模型访问')).toBeTruthy();
    expect(view.getByText('需要检查')).toBeTruthy();
    expect(view.getByText('选择 WebUI 镜像或模板')).toBeTruthy();
    expect(document.body.textContent).not.toContain('opl app action execute --action');
    expect(document.body.textContent).not.toContain('dry-run');
    expect(document.body.textContent).not.toContain('attention_needed');

    view.getAllByText('技术引用').forEach((summary) => openDetailsFor(summary));

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

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_open_docker_webui'));

    const mocks = getMocks();
    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_open_docker_webui',
        dryRun: true,
      })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(await view.findByText('部署前检查完成。')).toBeTruthy();
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

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_open_docker_webui'));

    await waitFor(() => expect(view.getByText('部署前检查失败。')).toBeTruthy());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('部署前检查完成。');
  });

  it('does not invent shell-local input for Docker WebUI actions that require payload refs', () => {
    const view = render(<ResourcesSettingsContent />);

    openDetailsFor(view.getByText('更多操作'));
    const seedAction = view.getByTestId('opl-settings-docker-webui-action-settings_select_webui_seed');
    expect(seedAction).toHaveAttribute('disabled');
    expect(seedAction.textContent).toContain('需要填写信息');
    fireEvent.click(seedAction);

    expect(getMocks().executeActionInvoke).not.toHaveBeenCalled();
  });
});
