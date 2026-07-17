import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  statusChangedOn: vi.fn(() => () => undefined),
  generateQRToken: vi.fn(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  navigateToSettingsTab: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn().mockResolvedValue(undefined),
  configRemove: vi.fn().mockResolvedValue(undefined),
  saveMcpServers: vi.fn().mockResolvedValue(undefined),
  setMcpServers: vi.fn(),
}));

vi.mock('@/common/config/constants', () => ({ WEBUI_DEFAULT_PORT: 25808 }));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shell: { openExternal: { invoke: mocks.openExternal } },
  webui: {
    getStatus: { invoke: mocks.getStatus },
    statusChanged: { on: mocks.statusChangedOn },
    generateQRToken: { invoke: mocks.generateQRToken },
    start: { invoke: vi.fn() },
    stop: { invoke: vi.fn().mockResolvedValue(undefined) },
    changePassword: { invoke: vi.fn() },
    changeUsername: { invoke: vi.fn() },
  },
  mcpService: {
    updateServer: { invoke: vi.fn() },
    toggleServer: { invoke: vi.fn() },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({ isBackendHttpError: () => false }));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.configGet,
    set: mocks.configSet,
    remove: mocks.configRemove,
  },
}));

vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => true }));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent', () => ({
  default: () => <div>Channels</div>,
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg aria-label='QR code' data-value={value} />,
}));

vi.mock('@/renderer/hooks/agent/useConfigModelListWithImage', () => ({
  default: () => ({ modelListWithImage: [] }),
}));

vi.mock('@/renderer/pages/settings/components/AddMcpServerModal', () => ({ default: () => null }));
vi.mock('@/renderer/pages/settings/ToolsSettings/McpServerItem', () => ({ default: () => null }));

vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => ({
    mcpServers: [],
    extensionMcpServers: [],
    saveMcpServers: mocks.saveMcpServers,
    setMcpServers: mocks.setMcpServers,
    isMcpServersLoading: false,
  }),
  useMcpConnection: () => ({
    testingServers: {},
    handleTestMcpConnection: vi.fn(),
    handleTestMcpConnections: vi.fn(),
  }),
  useMcpModal: () => ({
    showMcpModal: false,
    editingMcpServer: undefined,
    deleteConfirmVisible: false,
    serverToDelete: undefined,
    mcpCollapseKey: {},
    showAddMcpModal: vi.fn(),
    showEditMcpModal: vi.fn(),
    hideMcpModal: vi.fn(),
    showDeleteConfirm: vi.fn(),
    hideDeleteConfirm: vi.fn(),
    toggleServerCollapse: vi.fn(),
  }),
  useMcpServerCRUD: () => ({
    handleAddMcpServer: vi.fn(),
    handleBatchImportMcpServers: vi.fn(),
    handleEditMcpServer: vi.fn(),
    handleDeleteMcpServer: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: vi.fn(),
    markLoginRequired: vi.fn(),
    clearLoginRequired: vi.fn(),
    login: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
  useSettingsTabNavigate: () => mocks.navigateToSettingsTab,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; time?: string }) => options?.defaultValue ?? key,
  }),
}));

import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';

describe('flat WebUI and Tools accessibility', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
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
    mocks.getStatus.mockResolvedValue({
      running: true,
      port: 25808,
      allowRemote: true,
      localUrl: 'http://localhost:25808',
      networkUrl: 'http://192.168.1.10:25808',
      lanIP: '192.168.1.10',
      adminUsername: 'admin',
      initialPassword: 'initial-password',
    });
    mocks.generateQRToken.mockResolvedValue({ token: 'qr-token', expires_at_ms: Date.now() + 300_000 });
    mocks.configGet.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders WebUI configuration as flat Settings rows with named 32px icon actions', async () => {
    const { container } = render(<WebuiModalContent />);

    await waitFor(() => expect(screen.getByTestId('webui-qr-scan-surface')).toBeInTheDocument());

    const serviceSection = screen.getByTestId('webui-service-settings');
    const loginSection = screen.getByTestId('webui-login-settings');
    const webuiPanel = screen.getByRole('tabpanel');
    expect(webuiPanel).toContainElement(serviceSection);
    expect(screen.getAllByRole('tab').every((tab) => tab.querySelector('img') === null)).toBe(true);
    expect(serviceSection).toHaveClass('opl-settings-section');
    expect(loginSection).toHaveClass('opl-settings-section');
    expect(serviceSection.querySelector('.opl-settings-list')).not.toBeNull();
    expect(loginSection.querySelectorAll('.opl-settings-row').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('.rd-16px')).toBeNull();
    expect(container.querySelector('.rd-100px')).toBeNull();

    const qrSurface = screen.getByTestId('webui-qr-scan-surface');
    expect(qrSurface).toHaveClass('bg-white');
    expect(qrSurface.className).not.toContain('border');

    for (const name of [
      'settings.webui.copyAccessUrl',
      'settings.webui.copyUsername',
      'settings.webui.editUsernameTooltip',
      'settings.webui.resetPassword',
      'settings.webui.copyQrLink',
      'settings.webui.refreshQr',
    ]) {
      const action = screen.getByRole('button', { name });
      expect(action.className).toContain('32px');
      expect(action.className).toContain('focus-visible:outline');
    }

    fireEvent.click(screen.getByRole('tab', { name: 'settings.channels' }));
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getByText('Channels')).toBeInTheDocument());
  });

  it('uses a real button for model navigation and names the image-generation help link', () => {
    const { container } = render(<ToolsModalContent />);

    const modelSettings = screen.getByRole('button', { name: 'settings.goToModelSettings' });
    fireEvent.click(modelSettings);
    expect(mocks.navigateToSettingsTab).toHaveBeenCalledWith('model');
    expect(container.querySelector('a:not([href])')).toBeNull();

    const help = screen.getByRole('link', { name: 'settings.imageGenerationHelpLabel' });
    expect(help).toHaveAttribute('href');
    expect(help.className).toContain('size-32px');
    expect(help.className).toContain('focus-visible:outline');
    expect(screen.getByRole('switch', { name: 'settings.imageGeneration' })).toBeInTheDocument();
  });
});
