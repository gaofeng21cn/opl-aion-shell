/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDesktopNavigationCommand, IDesktopNavigationState } from '@/common/adapter/ipcBridge';
import i18n from '@process/services/i18n';
import type { MenuItemConstructorOptions } from 'electron';
import { BrowserWindow, Menu, app } from 'electron';

const MENU_ITEM_IDS = {
  back: 'desktop-navigation-back',
  forward: 'desktop-navigation-forward',
  previousTask: 'desktop-navigation-previous-task',
  nextTask: 'desktop-navigation-next-task',
} as const;

const DEFAULT_NAVIGATION_STATE: IDesktopNavigationState = {
  canBack: false,
  canForward: false,
  canPreviousTask: false,
  canNextTask: false,
};

type ApplicationMenuLabels = {
  file: string;
  edit: string;
  view: string;
  help: string;
  newWindow: string;
  back: string;
  forward: string;
  previousTask: string;
  nextTask: string;
  checkForUpdates: string;
};

type BuildApplicationMenuTemplateOptions = {
  appName: string;
  isMac: boolean;
  labels: ApplicationMenuLabels;
  navigationState: IDesktopNavigationState;
  onNewWindow: () => void;
  onNavigationCommand: (command: IDesktopNavigationCommand) => void;
};

let navigationState = DEFAULT_NAVIGATION_STATE;

export function buildApplicationMenuTemplate({
  appName,
  isMac,
  labels,
  navigationState: state,
  onNewWindow,
  onNavigationCommand,
}: BuildApplicationMenuTemplateOptions): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: labels.file,
    submenu: [{ label: labels.newWindow, click: onNewWindow }],
  });

  template.push({
    label: labels.edit,
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])
        : ([{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: labels.view,
    submenu: [
      {
        id: MENU_ITEM_IDS.back,
        label: labels.back,
        enabled: state.canBack,
        click: () => onNavigationCommand('back'),
      },
      {
        id: MENU_ITEM_IDS.forward,
        label: labels.forward,
        enabled: state.canForward,
        click: () => onNavigationCommand('forward'),
      },
      { type: 'separator' },
      {
        id: MENU_ITEM_IDS.previousTask,
        label: labels.previousTask,
        accelerator: 'Ctrl+Shift+Tab',
        enabled: state.canPreviousTask,
        click: () => onNavigationCommand('previous-task'),
      },
      {
        id: MENU_ITEM_IDS.nextTask,
        label: labels.nextTask,
        accelerator: 'Ctrl+Tab',
        enabled: state.canNextTask,
        click: () => onNavigationCommand('next-task'),
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: labels.help,
    submenu: [
      {
        label: labels.checkForUpdates,
        click: () => {
          ipcBridge.update.open.emit({ source: 'menu' });
        },
      },
    ],
  });

  return template;
}

export function updateApplicationMenuNavigationState(state: IDesktopNavigationState): void {
  navigationState = state;
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  const itemStates = [
    [MENU_ITEM_IDS.back, state.canBack],
    [MENU_ITEM_IDS.forward, state.canForward],
    [MENU_ITEM_IDS.previousTask, state.canPreviousTask],
    [MENU_ITEM_IDS.nextTask, state.canNextTask],
  ] as const;
  itemStates.forEach(([id, enabled]) => {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  });
}

export function setupApplicationMenu({ createWindow }: { createWindow: () => void }): void {
  const emitNavigationCommand = (command: IDesktopNavigationCommand) => {
    if (!BrowserWindow.getFocusedWindow()) return;
    ipcBridge.application.desktopNavigationCommand.emit({ command });
  };
  const labels: ApplicationMenuLabels = {
    file: i18n.t('common.appMenu.file'),
    edit: i18n.t('common.appMenu.edit'),
    view: i18n.t('common.appMenu.view'),
    help: i18n.t('common.appMenu.help'),
    newWindow: i18n.t('common.appMenu.newWindow'),
    back: i18n.t('common.appMenu.back'),
    forward: i18n.t('common.appMenu.forward'),
    previousTask: i18n.t('common.appMenu.previousTask'),
    nextTask: i18n.t('common.appMenu.nextTask'),
    checkForUpdates: i18n.t('common.appMenu.checkForUpdates'),
  };
  const template = buildApplicationMenuTemplate({
    appName: app.name,
    isMac: process.platform === 'darwin',
    labels,
    navigationState,
    onNewWindow: createWindow,
    onNavigationCommand: emitNavigationCommand,
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
