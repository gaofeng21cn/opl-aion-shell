import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import { MemoryRouter } from 'react-router-dom';
import { ResourcesSettingsContent } from '@/renderer/pages/settings/sections/ResourcesSettings';

const resourcesSettingsMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
  load: vi.fn(),
  navigate: vi.fn(),
  openExternalUrl: vi.fn(),
  resourceSources: null as Record<string, unknown> | null,
  payloadOnly: false,
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

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => resourcesSettingsMocks.navigate,
}));

const createResourceSources = () => ({
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
});

const openDetailsFor = (summary: HTMLElement) => {
  const details = summary.closest('details') as HTMLDetailsElement | null;
  expect(details).toBeTruthy();
  if (!details) return;
  details.open = true;
  fireEvent(details, new Event('toggle'));
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
  const Alert = ({ title, content, ...props }: { title?: React.ReactNode; content?: React.ReactNode }) => (
    <div {...props}>
      {title}
      {content}
    </div>
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
    Alert,
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
            ordinary_next_actions: resourcesSettingsMocks.payloadOnly
              ? [
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
                ]
              : [
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
          resource_sources: resourcesSettingsMocks.resourceSources,
        },
      },
    },
    load: resourcesSettingsMocks.load,
    refreshing: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: resourcesSettingsMocks.openExternalUrl,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.resourcesPage.title': '资源与连接',
        'settings.resourcesPage.description': '管理浏览器 WebUI、OPL Workspace、云端/托管工作区和外部环境连接。',
        'settings.resourcesPage.sections.serverWebui.title': '浏览器工作台',
        'settings.resourcesPage.sections.serverWebui.description': '在浏览器中使用 OPL。',
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
        'settings.resourcesPage.docker.openModelAccess': '打开模型访问设置',
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
        'settings.resourcesPage.docker.openSuccess': '已在浏览器中打开工作台。',
        'settings.resourcesPage.docker.openFailed': '暂时无法打开浏览器工作台。',
        'settings.resourcesPage.docker.checkSuccess': '工作台状态检查完成。',
        'settings.resourcesPage.docker.checkFailed': '工作台状态检查失败。',
        'settings.resourcesPage.docker.actionExecuteSuccess': '操作已完成。',
        'settings.resourcesPage.docker.actionExecuteFailed': '操作执行失败。',
        'settings.resourcesPage.docker.confirmTitle': '确认执行',
        'settings.resourcesPage.docker.confirmDescription': `检查已完成。继续后会执行“${options?.action ?? ''}”。`,
        'settings.resourcesPage.docker.confirmBoundary': '不会修改工作区文件或对话数据。',
        'settings.resourcesPage.docker.confirmAction': '继续执行',
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
        'settings.resourcesPage.connections.noWorkspaceSources': '当前没有上报 OPL Workspace 连接。',
        'settings.resourcesPage.connections.noSources': '当前没有上报云端或外部环境连接。',
        'settings.resourcesPage.connections.empty': '当前没有上报工作区或外部连接。',
        'settings.resourcesPage.connections.addConnection': '添加连接',
        'settings.resourcesPage.connections.addConnectionUnavailable': '当前未上报可执行的连接配置入口。',
        'settings.resourcesPage.statusLabels.action_available': '可用',
        'settings.resourcesPage.statusLabels.available': '可用',
        'settings.resourcesPage.statusLabels.attention_required': '需要检查',
        'settings.resourcesPage.statusLabels.needs_input': '需要填写信息',
        'settings.resourcesPage.statusLabels.not_configured': '尚未配置',
        'settings.resourcesPage.statusLabels.ready': '可用',
        'settings.resourcesPage.statusLabels.resourceReady': '已就绪',
        'settings.resourcesPage.statusLabels.unverified': '未验证',
        'settings.resourcesPage.resourceSources.environmentRefs': '有环境配置',
        'settings.resourcesPage.resourceSources.managementRefs': '有管理信息',
        'settings.resourcesPage.resourceSources.technicalRefs': '技术引用',
        'settings.resourcesPage.resourceSources.categories.remote': '远程资源',
        'settings.resourcesPage.resourceSources.categories.oplWorkspace': 'OPL Workspace',
        'settings.resourcesPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud 托管计算',
        'settings.resourcesPage.resourceSources.management.consoleManaged': '由 OPL Console 管理',
        'settings.resourcesPage.resourceSources.noRefs': '未报告资源上下文。',
        'settings.capabilitiesPage.refLabels.receipt': '回执摘要',
        'common.technical_details': '技术详情',
        'settings.accessPage.resourceSources.cloudRemoteAccess': '云端与远程访问',
        'settings.accessPage.resourceSources.oplWorkspace': 'OPL Workspace',
        'settings.accessPage.resourceSources.categories.oplCloudCompute': 'OPL Cloud 托管计算',
      };
      return labels[key] ?? options?.status ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('ResourcesSettingsContent', () => {
  const renderResources = () =>
    render(
      <MemoryRouter>
        <ResourcesSettingsContent />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    getMocks().resourceSources = createResourceSources();
    getMocks().payloadOnly = false;
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
    const view = renderResources();

    expect(view.getByText('资源与连接')).toBeTruthy();
    expect(view.getByTestId('settings-page-resources')).toHaveClass('opl-settings-page');
    expect(view.getByTestId('settings-resources-primary')).toBeTruthy();
    expect(view.getByTestId('settings-resources-technical-details')).not.toHaveAttribute('open');
    expect(view.getByText('浏览器工作台')).toBeTruthy();
    expect(view.getAllByText('OPL Workspace')).toHaveLength(1);
    expect(view.getByText('云端与外部环境')).toBeTruthy();
    expect(view.getAllByText('未验证').length).toBeGreaterThan(0);
    expect(view.getByText('重新检查')).toBeTruthy();
    expect(view.queryByText('可用')).toBeNull();
    expect(view.queryByText('打开 WebUI')).toBeNull();
    expect(view.queryByText('准备服务器/托管 WebUI')).toBeNull();
    expect(view.queryByText('配置 WebUI 模型访问')).toBeNull();
    expect(view.queryByText('选择 WebUI 镜像或模板')).toBeNull();
    expect(view.getByText('更多操作')).toBeTruthy();
    expect(view.getByTestId('opl-settings-workspace-resource-sources')).toBeTruthy();
    expect(view.getByTestId('opl-settings-resource-sources')).toBeTruthy();
    expect(document.body.textContent).not.toContain('opl app action execute --action');
    expect(document.body.textContent).not.toContain('dry-run');
    expect(document.body.textContent).not.toContain('payload');
    expect(document.body.textContent).not.toContain('Docker');
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
    expect(view.getByText('选择 WebUI 镜像或模板')).toBeTruthy();
    expect(view.getByText('打开 WebUI')).toBeTruthy();
    expect(view.getAllByText('需要填写信息').length).toBeGreaterThan(0);
    expect(view.getByTestId('opl-settings-docker-webui-action-settings_select_webui_seed')).toBeDisabled();
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

  it('uses the check action when WebUI actions exist without resource-ready evidence', async () => {
    const mocks = getMocks();
    mocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            docker_webui_doctor: {
              diagnostic_summary: {
                status: 'repairable_failure',
              },
            },
            receipt_summary: 'Docker WebUI diagnosis receipt accepted',
            receipt_ref: 'receipt://docker-webui/diagnose/latest',
          },
        },
      },
    });
    const view = renderResources();

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_diagnose_docker_webui'));

    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_diagnose_docker_webui',
        dryRun: false,
      })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true }));
    expect(view.getByTestId('opl-settings-docker-webui-action-evidence')).toHaveTextContent('工作台状态检查完成。');
    expect(view.getByTestId('opl-settings-docker-webui-action-result')).toHaveTextContent('repairable_failure');
    expect(view.getByTestId('opl-settings-docker-webui-action-receipt')).toHaveTextContent(
      'Docker WebUI diagnosis receipt accepted'
    );
  });

  it('keeps a deferred WebUI action single-flight when it is triggered twice before IPC settles', async () => {
    const mocks = getMocks();
    const deferred = createDeferred<{
      ok: boolean;
      parsed: { app_action_execution: { result: { docker_webui_doctor: { diagnostic_summary: { status: string } } } } };
    }>();
    mocks.executeActionInvoke.mockReturnValueOnce(deferred.promise);
    const view = renderResources();
    const action = view.getByTestId('opl-settings-docker-webui-action-settings_diagnose_docker_webui');

    act(() => {
      action.click();
      action.click();
    });

    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    deferred.resolve({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            docker_webui_doctor: {
              diagnostic_summary: { status: 'ok' },
            },
          },
        },
      },
    });
    await waitFor(() => expect(view.getByTestId('opl-settings-docker-webui-action-result')).toHaveTextContent('ok'));
    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(1);
  });

  it('opens the browser URL returned by the read-only WebUI action', async () => {
    const mocks = getMocks();
    mocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            docker_webui_browser_entry: {
              browser_url: 'http://127.0.0.1:3000/workbench/?workspace=alpha%2Fbeta#tasks',
            },
          },
        },
      },
    });
    const view = renderResources();

    openDetailsFor(view.getByText('更多操作'));
    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_open_docker_webui'));

    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_open_docker_webui',
        dryRun: false,
      })
    );
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:3000/workbench/?workspace=alpha%2Fbeta#tasks');
    expect(await view.findByText('已在浏览器中打开工作台。')).toBeTruthy();
  });

  it('routes model access setup to the Access page anchor without executing an action', () => {
    const view = renderResources();

    openDetailsFor(view.getByText('更多操作'));
    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_configure_webui_api_key'));

    expect(getMocks().navigate).toHaveBeenCalledWith('/settings/access?section=opl-gateway');
    expect(getMocks().executeActionInvoke).not.toHaveBeenCalled();
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
    const view = renderResources();

    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_diagnose_docker_webui'));

    await waitFor(() => expect(view.getByText('工作台状态检查失败。')).toBeTruthy());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('工作台状态检查完成。');
  });

  it('renders one honest empty state when no resource source is reported', () => {
    getMocks().resourceSources = null;

    const view = renderResources();

    expect(view.getByTestId('opl-settings-resource-sources-empty')).toBeTruthy();
    expect(view.queryByTestId('opl-settings-workspace-resource-sources')).toBeNull();
    expect(view.queryByTestId('opl-settings-resource-sources')).toBeNull();
    expect(view.getByText('当前没有上报工作区或外部连接。')).toBeTruthy();
    expect(view.queryByTestId('opl-settings-add-connection')).toBeNull();
    expect(view.queryAllByText('OPL Workspace')).toHaveLength(0);
  });

  it('shows a blocked next step when every projected action requires an input flow', () => {
    getMocks().payloadOnly = true;
    const view = renderResources();

    expect(view.getByText('选择 WebUI 镜像或模板')).toBeTruthy();
    expect(view.getByText('需要填写信息')).toBeTruthy();
    expect(view.queryByText('settings.resourcesPage.docker.noActions')).toBeNull();
    expect(view.queryByTestId('settings-resources-primary-action')).toBeNull();
    openDetailsFor(view.getByText('更多操作'));
    expect(view.getByTestId('opl-settings-docker-webui-action-settings_select_webui_seed')).toBeDisabled();
    expect(getMocks().executeActionInvoke).not.toHaveBeenCalled();
  });

  it('requires a successful precheck and explicit confirmation before a deployment action executes', async () => {
    const mocks = getMocks();
    const executeDeferred = createDeferred<unknown>();
    mocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            settings_control_center_action: { status: 'precheck_passed' },
            receipt_summary: 'mutation completion receipt must stay hidden during precheck',
            receipt_ref: 'receipt://docker-webui/install/precheck',
          },
        },
      },
    });
    mocks.executeActionInvoke.mockReturnValueOnce(executeDeferred.promise);
    const view = renderResources();

    openDetailsFor(view.getByText('更多操作'));
    fireEvent.click(view.getByTestId('opl-settings-docker-webui-action-settings_install_docker_webui'));

    await waitFor(() =>
      expect(mocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_install_docker_webui',
        dryRun: true,
      })
    );
    expect(view.getByTestId('opl-settings-docker-webui-confirmation')).toHaveTextContent('确认执行');
    expect(view.getByTestId('opl-settings-docker-webui-action-evidence')).toHaveTextContent('部署前检查完成。');
    expect(view.getByTestId('opl-settings-docker-webui-action-result')).toHaveTextContent('precheck_passed');
    expect(view.queryByTestId('opl-settings-docker-webui-action-receipt')).toBeNull();
    expect(document.body.textContent).not.toContain('mutation completion receipt must stay hidden during precheck');
    expect(document.body.textContent).not.toContain('操作已完成。');
    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(1);

    const confirm = view.getByTestId('opl-settings-docker-webui-confirm');
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(mocks.executeActionInvoke).toHaveBeenLastCalledWith({
      actionId: 'settings_install_docker_webui',
      dryRun: false,
    });
    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(2);
    executeDeferred.resolve({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            opl_install: { status: 'completed' },
            receipt: {
              summary: 'Docker WebUI install receipt accepted',
              receipt_ref: 'receipt://docker-webui/install/latest',
            },
          },
        },
      },
    });
    await waitFor(() =>
      expect(view.getByTestId('opl-settings-docker-webui-action-evidence')).toHaveTextContent('操作已完成。')
    );
    expect(view.getByTestId('opl-settings-docker-webui-action-evidence')).toHaveTextContent('操作已完成。');
    expect(view.queryByTestId('opl-settings-docker-webui-confirmation')).toBeNull();
    expect(view.getByTestId('opl-settings-docker-webui-action-result')).toHaveTextContent('completed');
    expect(view.getByTestId('opl-settings-docker-webui-action-receipt')).toHaveTextContent(
      'Docker WebUI install receipt accepted'
    );
    expect(mocks.executeActionInvoke).toHaveBeenCalledTimes(2);
  });
});
