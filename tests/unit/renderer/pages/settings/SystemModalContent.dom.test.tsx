import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRunOplCommand = vi.fn();
const mockGetStartOnBootStatus = vi.fn();
const mockSetStartOnBoot = vi.fn();
const mockSystemInfo = vi.fn();
const mockRestart = vi.fn();
const mockUpdateSystemInfo = vi.fn();
const mockOpenFile = vi.fn();
const mockSystemSettings = {
  getCloseToTray: vi.fn(),
  setCloseToTray: vi.fn(),
  getNotificationEnabled: vi.fn(),
  setNotificationEnabled: vi.fn(),
  getCronNotificationEnabled: vi.fn(),
  setCronNotificationEnabled: vi.fn(),
  getSaveUploadToWorkspace: vi.fn(),
  setSaveUploadToWorkspace: vi.fn(),
  getAutoPreviewOfficeFiles: vi.fn(),
  setAutoPreviewOfficeFiles: vi.fn(),
};
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockMessageError = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join('|')}` : key,
  }),
}));

vi.mock('swr', () => ({
  default: (_key: string, fetcher?: () => unknown) => {
    void fetcher?.();
    return {
      data: {
        cacheDir: '/tmp/aion-cache',
        workDir: '/tmp/aion-work',
        logDir: '/tmp/aion-log',
      },
    };
  },
  mutate: vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const React = await import('react');
  const Alert = ({ content }: { content?: React.ReactNode }) => <div role='alert'>{content}</div>;
  const Button = ({
    children,
    icon: _icon,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; loading?: boolean }) => (
    <button {...props} aria-busy={loading ? 'true' : undefined}>
      {children}
    </button>
  );
  const Collapse = Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children, header }: { children?: React.ReactNode; header?: React.ReactNode }) => (
      <div>
        {header}
        {children}
      </div>
    ),
  });
  const FormComponent = ({
    children,
    onValuesChange: _onValuesChange,
  }: {
    children: React.ReactNode;
    onValuesChange?: (...args: unknown[]) => void;
  }) => <form>{children}</form>;
  const Form = Object.assign(FormComponent, {
    useForm: () => [
      {
        setFieldsValue: vi.fn(),
        setFieldValue: vi.fn(),
      },
    ],
    Item: ({ children, label }: { children?: React.ReactNode; label?: React.ReactNode }) => (
      <label>
        {label}
        {children}
      </label>
    ),
  });
  const InputNumber = ({
    value,
    onBlur,
    onChange,
  }: {
    value?: number;
    onBlur?: () => void;
    onChange?: (value: number) => void;
  }) => (
    <input
      type='number'
      value={value ?? ''}
      onBlur={onBlur}
      onChange={(event) => onChange?.(Number(event.currentTarget.value))}
    />
  );
  const Message = { error: (...args: unknown[]) => mockMessageError(...args) };
  const Modal = {
    useModal: () => [{ confirm: vi.fn() }, null],
  };
  const Switch = ({
    checked,
    disabled,
    loading,
    onChange,
    onClick,
  }: {
    checked?: boolean;
    disabled?: boolean;
    loading?: boolean;
    onChange?: (checked: boolean) => void;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button
      type='button'
      role='switch'
      aria-checked={checked ? 'true' : 'false'}
      aria-busy={loading ? 'true' : undefined}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        onChange?.(!checked);
      }}
    />
  );
  const Tooltip = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return { Alert, Button, Collapse, Form, InputNumber, Message, Modal, Switch, Tooltip };
});

vi.mock('@icon-park/react', () => ({
  FolderSearch: () => <span data-testid='folder-icon' />,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getStartOnBootStatus: { invoke: (...args: unknown[]) => mockGetStartOnBootStatus(...args) },
      setStartOnBoot: { invoke: (...args: unknown[]) => mockSetStartOnBoot(...args) },
      systemInfo: { invoke: (...args: unknown[]) => mockSystemInfo(...args) },
      updateSystemInfo: { invoke: (...args: unknown[]) => mockUpdateSystemInfo(...args) },
      restart: { invoke: (...args: unknown[]) => mockRestart(...args) },
    },
    shell: {
      runOplCommand: { invoke: (...args: unknown[]) => mockRunOplCommand(...args) },
      openFile: { invoke: (...args: unknown[]) => mockOpenFile(...args) },
    },
    systemSettings: {
      getCloseToTray: { invoke: (...args: unknown[]) => mockSystemSettings.getCloseToTray(...args) },
      setCloseToTray: { invoke: (...args: unknown[]) => mockSystemSettings.setCloseToTray(...args) },
      getNotificationEnabled: { invoke: (...args: unknown[]) => mockSystemSettings.getNotificationEnabled(...args) },
      setNotificationEnabled: { invoke: (...args: unknown[]) => mockSystemSettings.setNotificationEnabled(...args) },
      getCronNotificationEnabled: {
        invoke: (...args: unknown[]) => mockSystemSettings.getCronNotificationEnabled(...args),
      },
      setCronNotificationEnabled: {
        invoke: (...args: unknown[]) => mockSystemSettings.setCronNotificationEnabled(...args),
      },
      getSaveUploadToWorkspace: {
        invoke: (...args: unknown[]) => mockSystemSettings.getSaveUploadToWorkspace(...args),
      },
      setSaveUploadToWorkspace: {
        invoke: (...args: unknown[]) => mockSystemSettings.setSaveUploadToWorkspace(...args),
      },
      getAutoPreviewOfficeFiles: {
        invoke: (...args: unknown[]) => mockSystemSettings.getAutoPreviewOfficeFiles(...args),
      },
      setAutoPreviewOfficeFiles: {
        invoke: (...args: unknown[]) => mockSystemSettings.setAutoPreviewOfficeFiles(...args),
      },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
    set: (...args: unknown[]) => mockConfigSet(...args),
  },
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div data-testid='language-switcher' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/DevSettings', () => ({
  default: () => <div data-testid='dev-settings' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/DirInputItem', () => ({
  default: ({ label }: { label: string }) => <input aria-label={label} />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: React.ReactNode;
    description?: React.ReactNode;
    label: string;
  }) => (
    <div data-testid={`preference-${label}`}>
      <div>{label}</div>
      {description && <div>{description}</div>}
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  AUTO_PREVIEW_OFFICE_FILES_SWR_KEY: 'auto-preview-office-files',
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000' },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';

function developerSupervisorPayload(enabled: 'on' | 'off') {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      system_action: {
        developer_supervisor: {
          enabled,
          mode: 'developer_apply_safe',
          source: 'user-config',
        },
        developer_mode: {
          enabled,
          status: enabled === 'on' ? 'enabled' : 'disabled',
          effective_state: enabled,
          allowed_route: 'developer_apply_safe',
          github_identity: { login: 'tester' },
        },
      },
    }),
    stderr: '',
  };
}

describe('SystemModalContent settings behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
    mockGetStartOnBootStatus.mockResolvedValue({
      success: true,
      data: { supported: true, enabled: false, isPackaged: true, platform: 'darwin' },
    });
    mockSetStartOnBoot.mockResolvedValue({
      success: true,
      data: { supported: true, enabled: true, isPackaged: true, platform: 'darwin' },
    });
    mockSystemInfo.mockResolvedValue({
      cacheDir: '/tmp/aion-cache',
      workDir: '/tmp/aion-work',
      logDir: '/tmp/aion-log',
    });
    mockUpdateSystemInfo.mockResolvedValue({ success: true });
    mockRestart.mockResolvedValue(undefined);
    mockConfigGet.mockResolvedValue(undefined);
    mockConfigSet.mockResolvedValue(undefined);
    mockSystemSettings.getCloseToTray.mockResolvedValue(false);
    mockSystemSettings.setCloseToTray.mockResolvedValue(undefined);
    mockSystemSettings.getNotificationEnabled.mockResolvedValue(true);
    mockSystemSettings.setNotificationEnabled.mockResolvedValue(undefined);
    mockSystemSettings.getCronNotificationEnabled.mockResolvedValue(false);
    mockSystemSettings.setCronNotificationEnabled.mockResolvedValue(undefined);
    mockSystemSettings.getSaveUploadToWorkspace.mockResolvedValue(true);
    mockSystemSettings.setSaveUploadToWorkspace.mockResolvedValue(undefined);
    mockSystemSettings.getAutoPreviewOfficeFiles.mockResolvedValue(true);
    mockSystemSettings.setAutoPreviewOfficeFiles.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue(developerSupervisorPayload('off'));
  });

  it('shows Developer Mode and toggles it through the OPL system command', async () => {
    render(<SystemModalContent />);

    const developerModeRow = await screen.findByTestId('preference-settings.developerMode');
    expect(within(developerModeRow).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(developerModeRow).toHaveTextContent('settings.developerModeDescWithStatus:disabled');

    mockRunOplCommand.mockResolvedValueOnce(developerSupervisorPayload('on'));
    fireEvent.click(within(developerModeRow).getByRole('switch'));

    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledWith({
        args: ['system', 'developer-supervisor', '--enabled', 'on'],
      });
      expect(within(developerModeRow).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('keeps key system switches clickable without crashing', async () => {
    render(<SystemModalContent />);

    const closeToTrayRow = await screen.findByTestId('preference-settings.closeToTray');
    const saveUploadRow = screen.getByTestId('preference-settings.saveUploadToWorkspace');
    const autoPreviewRow = screen.getByTestId('preference-settings.autoPreviewOfficeFiles');

    fireEvent.click(within(closeToTrayRow).getByRole('switch'));
    fireEvent.click(within(saveUploadRow).getByRole('switch'));
    fireEvent.click(within(autoPreviewRow).getByRole('switch'));

    await waitFor(() => {
      expect(mockSystemSettings.setCloseToTray).toHaveBeenCalledWith({ enabled: true });
      expect(mockSystemSettings.setSaveUploadToWorkspace).toHaveBeenCalledWith({ enabled: false });
      expect(mockSystemSettings.setAutoPreviewOfficeFiles).toHaveBeenCalledWith({ enabled: false });
    });
  });
});
