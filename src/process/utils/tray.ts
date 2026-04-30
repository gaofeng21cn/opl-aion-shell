/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, Tray as TrayInstance } from 'electron';
import { execFile } from 'child_process';
import {
  electronApp as app,
  electronMenu as Menu,
  electronNativeImage as nativeImage,
  electronTray as Tray,
} from '@/common/electronSafe';
import * as path from 'path';
import i18n from '@process/services/i18n';
import { workerTaskManager } from '../task/workerTaskManagerSingleton';
import { ProcessConfig } from './initStorage';

let tray: TrayInstance | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let mainWindowRef: BrowserWindow | null = null;

type RuntimeTrayActionOwner = 'user' | 'opl' | 'infrastructure' | 'none';
type RuntimeTrayActionKind =
  | 'human_gate'
  | 'handoff_review'
  | 'quality_gate'
  | 'publication_gate'
  | 'infrastructure_timeout'
  | 'infrastructure_recovery'
  | 'running';

type RuntimeTrayItem = {
  item_id: string;
  project_id: string;
  project_label: string;
  title: string;
  status_label: string;
  summary: string | null;
  updated_at: string | null;
  command: string | null;
  workspace_path: string | null;
  source_refs: Array<Record<string, unknown>>;
  action_owner?: RuntimeTrayActionOwner;
  requires_user_action?: boolean;
  action_kind?: RuntimeTrayActionKind | null;
  action_summary?: string;
  study_id?: string | null;
  workspace_label?: string | null;
  detail_summary?: string | null;
  next_action_summary?: string | null;
  active_run_id?: string | null;
  browser_url?: string | null;
  quest_session_api_url?: string | null;
  health_status?: string | null;
  blockers?: string[];
  recommended_commands?: Array<{
    step_id: string;
    title: string;
    surface_kind: string;
    command: string;
  }>;
};

type RuntimeTraySnapshot = {
  schema_version: 'runtime_tray_snapshot.v1';
  runtime_health: {
    status: 'offline' | 'needs_attention' | 'running' | 'idle';
    label: string;
    summary: string;
  };
  last_updated: string;
  running_items: RuntimeTrayItem[];
  attention_items: RuntimeTrayItem[];
  recent_items: RuntimeTrayItem[];
  action_counts?: {
    user: number;
    opl: number;
    infrastructure: number;
  };
  source_refs: Array<Record<string, unknown>>;
};

type RecentConversation = {
  id: string;
  title: string;
};

type TrayContextMenuState = {
  recentConversations: RecentConversation[];
  runtimeSnapshot: RuntimeTraySnapshot;
  desktopPetEnabled: boolean;
};

type TrayClickEvent = Electron.KeyboardEvent & {
  event?: {
    button?: number;
  };
};

const RUNTIME_SNAPSHOT_COMMAND = 'command -v opl >/dev/null && OPL_OUTPUT=json opl runtime snapshot --json';
const RUNTIME_SNAPSHOT_TIMEOUT_MS = 20_000;

const unavailableRuntimeTraySnapshot = (): RuntimeTraySnapshot => ({
  schema_version: 'runtime_tray_snapshot.v1',
  runtime_health: {
    status: 'offline',
    label: 'Offline',
    summary: 'OPL runtime snapshot projection is unavailable.',
  },
  last_updated: new Date().toISOString(),
  running_items: [],
  attention_items: [],
  recent_items: [],
  source_refs: [],
});

let lastRuntimeTraySnapshot: RuntimeTraySnapshot | null = null;
let lastRecentConversations: RecentConversation[] = [];
let lastDesktopPetEnabled = false;
let runtimeTraySnapshotRefreshInFlight: Promise<void> | null = null;

const getCachedRuntimeTraySnapshot = (): RuntimeTraySnapshot => {
  if (!lastRuntimeTraySnapshot) {
    lastRuntimeTraySnapshot = unavailableRuntimeTraySnapshot();
  }
  return lastRuntimeTraySnapshot;
};

export const setTrayMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

export const getCloseToTrayEnabled = (): boolean => closeToTrayEnabled;

export const setCloseToTrayEnabled = (enabled: boolean): void => {
  closeToTrayEnabled = enabled;
};

export const getIsQuitting = (): boolean => isQuitting;

export const setIsQuitting = (quitting: boolean): void => {
  isQuitting = quitting;
};

/**
 * Get tray icon.
 * macOS uses Template image to adapt to dark/light menu bar.
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  if (process.platform === 'darwin') {
    const templateIcon = nativeImage.createFromPath(path.join(resourcesPath, 'trayTemplate.png'));
    if (!templateIcon.isEmpty()) {
      templateIcon.setTemplateImage(true);
      return templateIcon;
    }

    const fallbackIcon = nativeImage
      .createFromPath(path.join(resourcesPath, 'app.png'))
      .resize({ width: 16, height: 16 });
    fallbackIcon.setTemplateImage(true);
    return fallbackIcon;
  }
  const icon = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
  return icon.resize({ width: 32, height: 32 });
};

const isRuntimeTraySnapshot = (value: unknown): value is RuntimeTraySnapshot => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<RuntimeTraySnapshot>;
  return (
    snapshot.schema_version === 'runtime_tray_snapshot.v1' &&
    Array.isArray(snapshot.running_items) &&
    Array.isArray(snapshot.attention_items) &&
    Array.isArray(snapshot.recent_items) &&
    Boolean(snapshot.runtime_health && typeof snapshot.runtime_health.status === 'string')
  );
};

const readRuntimeTraySnapshot = async (): Promise<RuntimeTraySnapshot | null> =>
  new Promise((resolve) => {
    execFile(
      '/bin/zsh',
      ['-lc', RUNTIME_SNAPSHOT_COMMAND],
      {
        timeout: RUNTIME_SNAPSHOT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        try {
          const payload = JSON.parse(stdout) as { runtime_tray_snapshot?: unknown };
          resolve(isRuntimeTraySnapshot(payload.runtime_tray_snapshot) ? payload.runtime_tray_snapshot : null);
        } catch {
          resolve(null);
        }
      }
    );
  });

const truncateMenuLabel = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
};

const runtimeHealthI18nKey = (status: RuntimeTraySnapshot['runtime_health']['status']): string => {
  switch (status) {
    case 'offline':
      return 'common.tray.runtimeStatusOffline';
    case 'needs_attention':
      return 'common.tray.runtimeStatusNeedsAttention';
    case 'running':
      return 'common.tray.runtimeStatusRunning';
    case 'idle':
      return 'common.tray.runtimeStatusIdle';
  }
};

const formatRuntimeItemLabel = (item: RuntimeTrayItem): string => {
  const title = truncateMenuLabel(item.title, 32);
  const status = item.status_label?.trim();
  const statusSuffix =
    status && !item.title.toLowerCase().includes(status.toLowerCase()) ? ` (${truncateMenuLabel(status, 18)})` : '';
  return `${item.project_label}: ${title}${statusSuffix}`;
};

const runtimeItemActionOwner = (item: RuntimeTrayItem): RuntimeTrayActionOwner => {
  if (item.requires_user_action || item.action_owner === 'user') {
    return 'user';
  }
  if (item.action_owner === 'opl' || item.action_owner === 'infrastructure') {
    return item.action_owner;
  }
  return 'none';
};

const allRuntimeItems = (snapshot: RuntimeTraySnapshot): RuntimeTrayItem[] => [
  ...snapshot.attention_items,
  ...snapshot.running_items,
  ...snapshot.recent_items,
];

const deriveRuntimeActionCounts = (snapshot: RuntimeTraySnapshot) => {
  if (snapshot.action_counts) {
    return snapshot.action_counts;
  }

  const counts = allRuntimeItems(snapshot).reduce(
    (counts, item) => {
      const owner = runtimeItemActionOwner(item);
      if (owner === 'user' || owner === 'opl' || owner === 'infrastructure') {
        counts[owner] += 1;
      }
      return counts;
    },
    { user: 0, opl: 0, infrastructure: 0 }
  );
  counts.opl += snapshot.attention_items.filter((item) => runtimeItemActionOwner(item) === 'none').length;
  return counts;
};

const formatRuntimeMenuSummary = (snapshot: RuntimeTraySnapshot): string => {
  const counts = deriveRuntimeActionCounts(snapshot);
  return i18n.t('common.tray.runtimeStatusSummary', {
    running: snapshot.running_items.length,
    opl: counts.opl,
    infrastructure: counts.infrastructure,
    user: counts.user,
  });
};

const partitionRuntimeItems = (snapshot: RuntimeTraySnapshot) => {
  const items = allRuntimeItems(snapshot);
  const isUser = (item: RuntimeTrayItem) => runtimeItemActionOwner(item) === 'user';
  const isOpl = (item: RuntimeTrayItem) => runtimeItemActionOwner(item) === 'opl';
  const isInfrastructure = (item: RuntimeTrayItem) => runtimeItemActionOwner(item) === 'infrastructure';

  const legacyAttention = snapshot.attention_items.filter((item) => runtimeItemActionOwner(item) === 'none');
  return {
    user: items.filter(isUser),
    opl: [...items.filter(isOpl), ...legacyAttention],
    running: snapshot.running_items.filter((item) => runtimeItemActionOwner(item) === 'none'),
    infrastructure: items.filter(isInfrastructure),
    recent: snapshot.recent_items.filter((item) => runtimeItemActionOwner(item) === 'none'),
  };
};

const appendRuntimeItems = (
  template: Electron.MenuItemConstructorOptions[],
  sectionLabelKey: string,
  items: RuntimeTrayItem[],
  onOpenItem: (item: RuntimeTrayItem) => void
): void => {
  if (items.length === 0) {
    return;
  }

  template.push({
    label: i18n.t(sectionLabelKey),
    enabled: false,
  });
  for (const item of items.slice(0, 5)) {
    template.push({
      label: formatRuntimeItemLabel(item),
      click: () => onOpenItem(item),
    });
  }
};

const isDesktopPetEnabled = async (): Promise<boolean> => {
  try {
    return (await ProcessConfig.get('pet.enabled')) === true;
  } catch {
    return false;
  }
};

const getRecentConversations = async (): Promise<RecentConversation[]> => {
  try {
    const { getDatabase } = await import('@process/services/database');
    const db = await getDatabase();
    const result = db.getUserConversations(undefined, 0, 5);
    return (result.data || []).slice(0, 5).map((conv) => ({
      id: conv.id,
      title: conv.name || i18n.t('common.tray.untitled'),
    }));
  } catch {
    return [];
  }
};

const getRunningTasksCount = (): number => {
  try {
    return workerTaskManager.listTasks().length;
  } catch {
    return 0;
  }
};

/**
 * Build tray context menu from already available state.
 *
 * This stays synchronous so the app can attach a usable tray menu before
 * slower runtime probes, database reads, or settings reads finish.
 */
const buildTrayContextMenuFromState = ({
  recentConversations,
  runtimeSnapshot,
  desktopPetEnabled,
}: TrayContextMenuState): Electron.Menu => {
  const runningTasksCount = getRunningTasksCount();
  const showAndFocus = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.show();
      }
      if (mainWindowRef.isMinimized()) {
        mainWindowRef.restore();
      }
      mainWindowRef.show();
      mainWindowRef.focus();
    }
  };

  const hideToTray = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide();
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.hide();
      }
    }
  };

  const openRuntimeItem = (item: RuntimeTrayItem) => {
    showAndFocus();
    mainWindowRef?.webContents.send('tray:open-opl-runtime-item', {
      projectId: item.project_id,
      projectLabel: item.project_label,
      itemId: item.item_id,
      title: item.title,
      statusLabel: item.status_label,
      summary: item.summary,
      updatedAt: item.updated_at,
      command: item.command,
      workspacePath: item.workspace_path,
      sourceRefs: item.source_refs,
      actionOwner: item.action_owner,
      requiresUserAction: item.requires_user_action,
      actionKind: item.action_kind,
      actionSummary: item.action_summary,
      studyId: item.study_id,
      workspaceLabel: item.workspace_label,
      detailSummary: item.detail_summary,
      nextActionSummary: item.next_action_summary,
      activeRunId: item.active_run_id,
      browserUrl: item.browser_url,
      questSessionApiUrl: item.quest_session_api_url,
      healthStatus: item.health_status,
      blockers: item.blockers,
      recommendedCommands: item.recommended_commands,
    });
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: i18n.t('common.tray.showWindow'),
      click: showAndFocus,
    },
    {
      label: i18n.t('common.tray.closeToTray'),
      click: hideToTray,
    },
    { type: 'separator' },
    {
      label: i18n.t('common.tray.newChat'),
      click: () => {
        showAndFocus();
        mainWindowRef?.webContents.send('tray:navigate-to-guid');
      },
    },
  ];

  template.push({ type: 'separator' });
  template.push({
    label: `${i18n.t('common.tray.runtimeStatus')}: ${i18n.t(runtimeHealthI18nKey(runtimeSnapshot.runtime_health.status))}`,
    enabled: false,
  });
  template.push({
    label: formatRuntimeMenuSummary(runtimeSnapshot),
    enabled: false,
  });
  const runtimeGroups = partitionRuntimeItems(runtimeSnapshot);
  appendRuntimeItems(template, 'common.tray.runtimeUserAction', runtimeGroups.user, openRuntimeItem);
  appendRuntimeItems(template, 'common.tray.runtimeOplAction', runtimeGroups.opl, openRuntimeItem);
  appendRuntimeItems(template, 'common.tray.runtimeRunning', runtimeGroups.running, openRuntimeItem);
  appendRuntimeItems(template, 'common.tray.runtimeInfrastructure', runtimeGroups.infrastructure, openRuntimeItem);
  appendRuntimeItems(template, 'common.tray.runtimeRecent', runtimeGroups.recent, openRuntimeItem);

  if (recentConversations.length > 0) {
    template.push({ type: 'separator' });
    template.push({
      label: i18n.t('common.tray.recentChats'),
      enabled: false,
    });
    for (const conv of recentConversations) {
      const displayTitle = conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title;
      template.push({
        label: displayTitle,
        click: () => {
          showAndFocus();
          mainWindowRef?.webContents.send('tray:navigate-to-conversation', {
            conversationId: conv.id,
          });
        },
      });
    }
  }

  template.push({ type: 'separator' });
  template.push({
    label: `${i18n.t('common.tray.runningTasks')}: ${runningTasksCount}`,
    enabled: false,
  });
  template.push({
    label: i18n.t('common.tray.pauseAll'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:pause-all-tasks');
    },
  });

  if (desktopPetEnabled) {
    template.push({ type: 'separator' });
    template.push({
      label: `🐾 ${i18n.t('pet.desktopPet')}`,
      submenu: [
        {
          label: i18n.t('pet.showHide'),
          click: async () => {
            try {
              const petManager = await import('../pet/petManager');
              // Toggle: if pet windows exist, hide; otherwise show/create
              petManager.showPetWindow();
            } catch {
              /* pet not available */
            }
          },
        },
        { type: 'separator' as const },
        {
          label: i18n.t('pet.sizeSmall', { px: 200 }),
          click: async () => {
            try {
              const { resizePetWindow } = await import('../pet/petManager');
              resizePetWindow(200);
            } catch {
              /* ignore */
            }
          },
        },
        {
          label: i18n.t('pet.sizeMedium', { px: 280 }),
          click: async () => {
            try {
              const { resizePetWindow } = await import('../pet/petManager');
              resizePetWindow(280);
            } catch {
              /* ignore */
            }
          },
        },
        {
          label: i18n.t('pet.sizeLarge', { px: 360 }),
          click: async () => {
            try {
              const { resizePetWindow } = await import('../pet/petManager');
              resizePetWindow(360);
            } catch {
              /* ignore */
            }
          },
        },
      ],
    });
  }
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.checkUpdate'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:check-update');
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.about'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:open-about');
    },
  });
  template.push({
    label: i18n.t('common.tray.restart'),
    click: () => {
      isQuitting = true;
      app.relaunch();
      app.exit(0);
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.quit'),
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(template);
};

const buildTrayContextMenu = async (): Promise<Electron.Menu> => {
  const [recentConversations, desktopPetEnabled] = await Promise.all([getRecentConversations(), isDesktopPetEnabled()]);
  lastRecentConversations = recentConversations;
  lastDesktopPetEnabled = desktopPetEnabled;
  return buildTrayContextMenuFromState({
    recentConversations,
    runtimeSnapshot: getCachedRuntimeTraySnapshot(),
    desktopPetEnabled,
  });
};

const setImmediateTrayContextMenu = (): void => {
  tray?.setContextMenu(
    buildTrayContextMenuFromState({
      recentConversations: lastRecentConversations,
      runtimeSnapshot: getCachedRuntimeTraySnapshot(),
      desktopPetEnabled: lastDesktopPetEnabled,
    })
  );
};

const refreshTrayMenuFromCachedState = async (): Promise<void> => {
  if (!tray) {
    return;
  }
  const menu = await buildTrayContextMenu();
  tray?.setContextMenu(menu);
};

const scheduleRuntimeTraySnapshotRefresh = (): void => {
  if (runtimeTraySnapshotRefreshInFlight) {
    return;
  }

  runtimeTraySnapshotRefreshInFlight = (async () => {
    const runtimeSnapshot = await readRuntimeTraySnapshot();
    if (!runtimeSnapshot) {
      lastRuntimeTraySnapshot = unavailableRuntimeTraySnapshot();
      setImmediateTrayContextMenu();
      await refreshTrayMenuFromCachedState();
      return;
    }

    lastRuntimeTraySnapshot = runtimeSnapshot;
    setImmediateTrayContextMenu();
    await refreshTrayMenuFromCachedState();
  })()
    .catch((error) => {
      console.warn('[Tray] Failed to refresh OPL runtime snapshot:', error);
    })
    .finally(() => {
      runtimeTraySnapshotRefreshInFlight = null;
    });
};

/**
 * Create system tray (idempotent — no-op if already exists).
 */
export const createOrUpdateTray = (): void => {
  if (tray) {
    return;
  }
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('One Person Lab');
    console.info('[Tray] Created One Person Lab tray entry');
    setImmediateTrayContextMenu();
    scheduleRuntimeTraySnapshotRefresh();

    tray.on('double-click', () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (process.platform === 'darwin' && app.dock) {
          void app.dock.show();
        }
        if (mainWindowRef.isMinimized()) {
          mainWindowRef.restore();
        }
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });

    tray.on('click', (event: TrayClickEvent) => {
      if (event.event?.button === 2) {
        void refreshTrayMenu();
        scheduleRuntimeTraySnapshotRefresh();
      }
    });
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * Refresh tray context menu labels (called on language change).
 */
export const refreshTrayMenu = async (): Promise<void> => {
  if (tray) {
    await refreshTrayMenuFromCachedState();
  }
};

/**
 * Destroy system tray.
 */
export const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};
