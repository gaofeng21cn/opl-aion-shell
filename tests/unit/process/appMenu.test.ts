import type { IDesktopNavigationCommand } from '@/common/adapter/ipcBridge';
import { buildApplicationMenuTemplate, updateApplicationMenuNavigationState } from '@/process/utils/appMenu';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  getApplicationMenu: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { desktopNavigationCommand: { emit: vi.fn() } },
    update: { open: { emit: vi.fn() } },
  },
}));

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('electron', () => ({
  app: { name: 'One Person Lab' },
  BrowserWindow: { getFocusedWindow: vi.fn() },
  Menu: {
    buildFromTemplate: vi.fn(),
    getApplicationMenu: electron.getApplicationMenu,
    setApplicationMenu: vi.fn(),
  },
}));

const englishLabels = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  help: 'Help',
  newWindow: 'New Window',
  back: 'Back',
  forward: 'Forward',
  previousTask: 'Previous Task',
  nextTask: 'Next Task',
  checkForUpdates: 'Check for Updates...',
};

const chineseLabels = {
  file: '文件',
  edit: '编辑',
  view: '显示',
  help: '帮助',
  newWindow: '新建窗口',
  back: '后退',
  forward: '前进',
  previousTask: '上一个任务',
  nextTask: '下一个任务',
  checkForUpdates: '检查更新...',
};

const enabledState = {
  canBack: true,
  canForward: true,
  canPreviousTask: true,
  canNextTask: true,
};

const submenu = (template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] => {
  const menu = template.find((item) => item.label === label);
  return Array.isArray(menu?.submenu) ? menu.submenu : [];
};

const buildTemplate = (labels: typeof englishLabels, state = enabledState) => {
  const commands: IDesktopNavigationCommand[] = [];
  const onNewWindow = vi.fn();
  const template = buildApplicationMenuTemplate({
    appName: 'One Person Lab',
    isMac: true,
    labels,
    navigationState: state,
    onNewWindow,
    onNavigationCommand: (command) => commands.push(command),
  });
  return { commands, onNewWindow, template };
};

describe('desktop application menu', () => {
  it.each([
    [englishLabels, ['File', 'Edit', 'View', 'Help'], ['New Window', 'Back', 'Forward', 'Previous Task', 'Next Task']],
    [chineseLabels, ['文件', '编辑', '显示', '帮助'], ['新建窗口', '后退', '前进', '上一个任务', '下一个任务']],
  ])('renders current-language labels', (labels, topLevelLabels, commandLabels) => {
    const { template } = buildTemplate(labels);
    const nativeMenus = template.slice(1);
    const viewItems = submenu(template, labels.view);

    expect(nativeMenus.map((item) => item.label)).toEqual(topLevelLabels);
    expect([
      submenu(template, labels.file)[0]?.label,
      ...viewItems
        .slice(0, 5)
        .filter((item) => item.type !== 'separator')
        .map((item) => item.label),
    ]).toEqual(commandLabels);
  });

  it('uses only the existing task accelerators and disables unavailable navigation', () => {
    const { commands, onNewWindow, template } = buildTemplate(englishLabels, {
      canBack: false,
      canForward: false,
      canPreviousTask: false,
      canNextTask: true,
    });
    const fileItems = submenu(template, englishLabels.file);
    const viewItems = submenu(template, englishLabels.view);
    const [back, forward, , previousTask, nextTask] = viewItems;

    expect(fileItems[0]?.accelerator).toBeUndefined();
    expect(back?.accelerator).toBeUndefined();
    expect(forward?.accelerator).toBeUndefined();
    expect(previousTask?.accelerator).toBe('Ctrl+Shift+Tab');
    expect(nextTask?.accelerator).toBe('Ctrl+Tab');
    expect([back?.enabled, forward?.enabled, previousTask?.enabled, nextTask?.enabled]).toEqual([
      false,
      false,
      false,
      true,
    ]);

    fileItems[0]?.click?.({} as never, {} as never, {} as never);
    nextTask?.click?.({} as never, {} as never, {} as never);
    expect(onNewWindow).toHaveBeenCalledOnce();
    expect(commands).toEqual(['next-task']);
  });

  it('updates the installed menu when focused-route availability changes', () => {
    const items = new Map(
      ['back', 'forward', 'previous-task', 'next-task'].map((suffix) => [
        `desktop-navigation-${suffix}`,
        { enabled: false },
      ])
    );
    electron.getApplicationMenu.mockReturnValue({
      getMenuItemById: (id: string) => items.get(id),
    });

    updateApplicationMenuNavigationState({
      canBack: true,
      canForward: false,
      canPreviousTask: true,
      canNextTask: false,
    });

    expect([...items.values()].map((item) => item.enabled)).toEqual([true, false, true, false]);
  });
});
