/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import log from 'electron-log';
import { EventEmitter } from 'events';
import fs from 'node:fs';
import * as path from 'node:path';
import type { ExactUpdateReleaseTarget } from '../../common/update/updateTypes';
import {
  recordAutoUpdateInstallNotAppliedIfNeeded,
  recordAutoUpdateQuitAndInstall,
  recordAutoUpdateStatus,
} from './autoUpdateDiagnostics';
import {
  launchLocalAuthorizedMacosInstaller,
  resolveLocalAuthorizedMacosUpdatePlan,
} from './localAuthorizedMacosUpdater';
import { cleanupAutoUpdateCaches, getDefaultAutoUpdateCacheRoot } from './autoUpdateCacheCleanup';

/**
 * Returns the appropriate update channel name based on the current platform and architecture.
 * Returns undefined for the default channel (Windows x64 / Linux x64).
 */
export function getUpdateChannel(): string | undefined {
  const { platform, arch } = process;

  // electron-updater appends a platform suffix to the channel name:
  //   macOS  → "-mac"       (e.g. "latest" → "latest-mac.yml")
  //   Linux  → "-linux"     (+ arch suffix for non-x64, e.g. "latest-linux-arm64.yml")
  //   Windows → ""          (no suffix, e.g. "latest.yml")
  //
  // Linux arm64 is handled natively by electron-updater (appends "-linux-arm64"),
  // so only Windows arm64 and macOS arm64 need a custom channel.

  if (platform === 'win32' && arch === 'arm64') {
    // "latest-win-arm64" + "" → "latest-win-arm64.yml"
    return 'latest-win-arm64';
  }
  if (platform === 'darwin' && arch === 'arm64') {
    // "latest-arm64" + "-mac" → "latest-arm64-mac.yml"
    return 'latest-arm64';
  }
  // macOS x64  → default "latest" + "-mac"         → "latest-mac.yml"
  // Linux x64  → default "latest" + "-linux"       → "latest-linux.yml"
  // Linux arm64→ default "latest" + "-linux-arm64"  → "latest-linux-arm64.yml"
  // Win x64    → default "latest" + ""             → "latest.yml"
  return undefined;
}

export interface AutoUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'cancelled';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

export type AutoUpdaterReleaseTarget = ExactUpdateReleaseTarget;

type AutoUpdateCheckOutcome = {
  success: boolean;
  updateInfo?: UpdateInfo;
  error?: string;
};

type PendingUpdateOperation = {
  downloadRequested: boolean;
  promise: Promise<AutoUpdateCheckOutcome>;
};

export function isMissingPackagedUpdaterConfigError(message: string): boolean {
  return message.includes('app-update.yml') && /Cannot find|ENOENT|no such file|missing/i.test(message);
}

function resolvePackagedUpdaterConfigPath(): string | null {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  if (!resourcesPath) return null;
  return path.join(resourcesPath, 'app-update.yml');
}

/** Callback type for broadcasting update status */
export type StatusBroadcastCallback = (status: AutoUpdateStatus) => void;

/** Events emitted by AutoUpdaterService */
export interface AutoUpdaterEvents {
  'update-status': (status: AutoUpdateStatus) => void;
}

class AutoUpdaterService extends EventEmitter {
  private _isInitialized = false;
  private _eventHandlersSetup = false;
  private _allowPrerelease = false;
  private _statusBroadcastCallback: StatusBroadcastCallback | null = null;
  private _statusSnapshot: AutoUpdateStatus | null = null;
  private _startupCheckStarted = false;
  private readonly _updateOperations = new Map<string, PendingUpdateOperation>();
  private readonly _verifiedTargets = new Set<string>();
  private _updateOperationTail: Promise<void> = Promise.resolve();
  /** Stores registered autoUpdater event handlers for cleanup and test access */
  private readonly _autoUpdaterHandlers = new Map<string, (...args: unknown[]) => void>();
  private readonly _updaterCacheRoot = getDefaultAutoUpdateCacheRoot({
    appCacheDirName: 'one-person-lab-aion-shell-updater',
  });
  private readonly _retiredUpdaterCacheRoots = [
    getDefaultAutoUpdateCacheRoot({
      appCacheDirName: 'aionui-updater',
    }),
  ];

  constructor() {
    super();
    // Configure logging
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = 'info';

    // Exact Release identity must be verified before any bytes are downloaded.
    // Startup checks explicitly request a download after the frozen target matches.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set the correct update channel based on platform and architecture before
    // any update checks are performed
    const channel = getUpdateChannel();
    if (channel !== undefined) {
      autoUpdater.channel = channel;
      log.info(`Update channel set to: ${channel}`);
    }
  }

  /**
   * Initialize the service with an optional status broadcast callback.
   * This decouples the service from any specific window implementation.
   */
  initialize(statusBroadcastCallback?: StatusBroadcastCallback): void {
    this._statusBroadcastCallback = statusBroadcastCallback ?? null;
    this._isInitialized = true;
    this.cleanupDownloadedUpdateCache();
    const currentAppVersion = app.getVersion();
    const userDataPath = app.getPath('userData');
    recordAutoUpdateInstallNotAppliedIfNeeded({ currentAppVersion, userDataPath });

    // Setup event handlers only once
    if (!this._eventHandlersSetup) {
      this.setupEventHandlers();
      this._eventHandlersSetup = true;
    }
  }

  /**
   * Set the status broadcast callback (can be called after initialize)
   */
  setStatusBroadcastCallback(callback: StatusBroadcastCallback | null): void {
    this._statusBroadcastCallback = callback;
  }

  /**
   * Check if the service has been initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  getStatusSnapshot(): AutoUpdateStatus | null {
    return this._statusSnapshot ? structuredClone(this._statusSnapshot) : null;
  }

  /**
   * Reset the service state (for production use)
   */
  reset(): void {
    this._isInitialized = false;
    // Note: _eventHandlersSetup is NOT reset to avoid duplicate handler registration
    this._allowPrerelease = false;
    this._statusBroadcastCallback = null;
    this._statusSnapshot = null;
    this._startupCheckStarted = false;
    this._updateOperations.clear();
    this._verifiedTargets.clear();
    this._updateOperationTail = Promise.resolve();
  }

  /**
   * Reset the service state completely, including event handlers.
   * Use this only in tests where you need to reset handler state.
   */
  resetForTest(): void {
    this._isInitialized = false;
    this._eventHandlersSetup = false;
    this._allowPrerelease = false;
    this._statusBroadcastCallback = null;
    this._statusSnapshot = null;
    this._startupCheckStarted = false;
    this._updateOperations.clear();
    this._verifiedTargets.clear();
    this._updateOperationTail = Promise.resolve();
    // Remove listeners from this EventEmitter instance
    this.removeAllListeners();
    // Remove each registered handler from autoUpdater to prevent
    // duplicate handler accumulation across multiple initialize() calls in tests
    for (const [event, handler] of this._autoUpdaterHandlers) {
      autoUpdater.removeListener(
        event as Parameters<typeof autoUpdater.removeListener>[0],
        handler as Parameters<typeof autoUpdater.removeListener>[1]
      );
    }
    this._autoUpdaterHandlers.clear();
  }

  /**
   * Trigger a registered autoUpdater event handler by event name with optional arguments.
   * Intended for use in tests only — do not call in production code.
   * Throws if the handler for the given event has not been registered yet.
   */
  triggerEventForTest(event: string, ...args: unknown[]): void {
    const handler = this._autoUpdaterHandlers.get(event);
    if (!handler) {
      throw new Error(`No handler registered for autoUpdater event "${event}". Did you call initialize() first?`);
    }
    handler(...args);
  }

  /**
   * Set whether to allow prerelease/dev updates
   * When enabled, also sets allowDowngrade to true
   */
  setAllowPrerelease(allow: boolean): void {
    this._allowPrerelease = allow;
    // Do NOT set autoUpdater.allowPrerelease here.
    // electron-updater's prerelease mode conflicts with custom channel names
    // (e.g. 'latest-arm64'): it treats the channel as a prerelease identifier
    // and tries to match it against tag prerelease components, which always fails
    // with "No published versions on GitHub".
    // Prerelease filtering is handled by the manual update check (GitHub API) instead.
    log.info(`Prerelease updates ${allow ? 'enabled' : 'disabled'} (manual check only)`);
  }

  /**
   * Get current prerelease setting
   */
  get allowPrerelease(): boolean {
    return this._allowPrerelease;
  }

  private resolveMissingPackagedUpdaterConfigMessage(): string | null {
    const configPath = resolvePackagedUpdaterConfigPath();
    if (!configPath) return null;
    return fs.existsSync(configPath) ? null : configPath;
  }

  private setupEventHandlers(): void {
    const register = <T extends unknown[]>(event: string, handler: (...args: T) => void) => {
      // Cast to satisfy overloaded autoUpdater.on signature
      autoUpdater.on(event as Parameters<typeof autoUpdater.on>[0], handler as Parameters<typeof autoUpdater.on>[1]);
      this._autoUpdaterHandlers.set(event, handler as (...args: unknown[]) => void);
    };

    register('checking-for-update', () => {
      log.info('Checking for updates...');
      this.broadcastStatus({ status: 'checking' });
    });

    register('update-available', (info: UpdateInfo) => {
      log.info(`Update available: ${info.version}`);
      this.broadcastStatus({
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    register('update-not-available', () => {
      log.info('Application is up to date');
      this.broadcastStatus({ status: 'not-available' });
    });

    register('download-progress', (progress: ProgressInfo) => {
      log.info(`Download progress: ${progress.percent.toFixed(2)}%`);
      this.broadcastStatus({
        status: 'downloading',
        progress: {
          bytesPerSecond: progress.bytesPerSecond,
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });

    register('update-downloaded', (info: UpdateInfo) => {
      log.info('Update downloaded');
      this.broadcastStatus({
        status: 'downloaded',
        version: info.version,
      });
    });

    register('error', (error: Error) => {
      if (isMissingPackagedUpdaterConfigError(error.message)) {
        log.warn('Packaged auto-update config is unavailable; using manual release checks only:', error.message);
        this.broadcastStatus({ status: 'not-available' });
        return;
      }
      log.error('Auto-updater error:', error);
      this.broadcastStatus({
        status: 'error',
        error: error.message,
      });
    });
  }

  /**
   * Broadcast status to both EventEmitter listeners and the registered callback
   */
  private broadcastStatus(status: AutoUpdateStatus): void {
    this._statusSnapshot = structuredClone(status);
    recordAutoUpdateStatus(status, {
      currentAppVersion: app.getVersion(),
      userDataPath: app.getPath('userData'),
    });

    // Emit to internal listeners (for testing and extensibility)
    this.emit('update-status', status);

    // Call the registered callback if available
    if (this._statusBroadcastCallback) {
      this._statusBroadcastCallback(status);
    }
  }

  private cleanupDownloadedUpdateCache(keepPaths: string[] = []): void {
    try {
      const result = cleanupAutoUpdateCaches({
        cacheRoots: [this._updaterCacheRoot],
        retiredCacheRoots: this._retiredUpdaterCacheRoots,
        keepPaths,
      });
      if (result.removedFiles.length > 0) {
        log.info(
          `Cleaned auto-update cache: removed ${result.removedFiles.length} file(s), ${result.removedBytes} byte(s)`
        );
      }
    } catch (error) {
      log.warn('Auto-update cache cleanup skipped:', error);
    }
  }

  private configureExactReleaseTarget(target: AutoUpdaterReleaseTarget): void {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.repo)) {
      throw new Error(`Invalid updater repository: ${target.repo}`);
    }
    if (!target.tagName || target.tagName.includes('/') || !target.updaterVersion) {
      throw new Error('Invalid exact updater release target');
    }

    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `https://github.com/${target.repo}/releases/download/${encodeURIComponent(target.tagName)}/`,
      channel: getUpdateChannel(),
    });
    autoUpdater.allowDowngrade = false;
  }

  private updateTargetKey(target: AutoUpdaterReleaseTarget): string {
    return `${target.repo}@${target.tagName}:${target.updaterVersion}`;
  }

  private async performUpdateCheck(
    target: AutoUpdaterReleaseTarget | undefined,
    operation: PendingUpdateOperation
  ): Promise<AutoUpdateCheckOutcome> {
    try {
      if (!this._isInitialized) {
        throw new Error('AutoUpdaterService not initialized');
      }
      this.broadcastStatus({ status: 'checking' });
      const missingConfigPath = target ? null : this.resolveMissingPackagedUpdaterConfigMessage();
      if (!target && missingConfigPath) {
        log.warn('Packaged auto-update config is unavailable; using manual release checks only:', missingConfigPath);
        this.broadcastStatus({ status: 'not-available' });
        return { success: true };
      }

      if (target) {
        this.configureExactReleaseTarget(target);
      } else {
        autoUpdater.allowDowngrade = false;
      }
      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        const { default: i18n } = await import('./i18n');
        return { success: false, error: i18n.t('update.errors.checkReturnedNull') };
      }
      if (target && result.updateInfo.version !== target.updaterVersion) {
        throw new Error(
          `Exact updater release mismatch: expected ${target.updaterVersion}, received ${result.updateInfo.version}`
        );
      }
      // Only report updateInfo when electron-updater internally confirms the update is available.
      // When isUpdateAvailable is false, updateInfoAndProvider is NOT set internally,
      // so a subsequent downloadUpdate() call would fail with "Please check update first".
      if (!result.isUpdateAvailable) {
        this.broadcastStatus({ status: 'not-available' });
        return { success: true };
      }
      this.broadcastStatus({
        status: 'available',
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        releaseNotes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined,
      });
      if (target) {
        this._verifiedTargets.add(this.updateTargetKey(target));
      }
      if (operation.downloadRequested) {
        await autoUpdater.downloadUpdate();
      }
      return {
        success: true,
        updateInfo: result.updateInfo,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingPackagedUpdaterConfigError(message)) {
        log.warn('Packaged auto-update config is unavailable; using manual release checks only:', message);
        this.broadcastStatus({ status: 'not-available' });
        return { success: true };
      }
      log.error('Check for updates failed:', message);
      this.broadcastStatus({ status: 'error', error: message });
      return {
        success: false,
        error: message,
      };
    }
  }

  private runUpdateCheck(
    target: AutoUpdaterReleaseTarget | undefined,
    downloadRequested: boolean
  ): Promise<AutoUpdateCheckOutcome> {
    const key = target ? this.updateTargetKey(target) : 'packaged-default';
    const existing = this._updateOperations.get(key);
    if (existing) {
      existing.downloadRequested ||= downloadRequested;
      return existing.promise;
    }

    const operation = {
      downloadRequested,
    } as PendingUpdateOperation;
    operation.promise = this._updateOperationTail
      .then(() => this.performUpdateCheck(target, operation))
      .finally(() => {
        if (this._updateOperations.get(key) === operation) {
          this._updateOperations.delete(key);
        }
      });
    this._updateOperationTail = operation.promise.then(
      (): void => undefined,
      (): void => undefined
    );
    this._updateOperations.set(key, operation);
    return operation.promise;
  }

  async checkForUpdates(target?: AutoUpdaterReleaseTarget): Promise<AutoUpdateCheckOutcome> {
    return this.runUpdateCheck(target, false);
  }

  async downloadUpdate(target: AutoUpdaterReleaseTarget): Promise<{ success: boolean; error?: string }> {
    if (!this._verifiedTargets.has(this.updateTargetKey(target))) {
      return { success: false, error: 'Exact updater release target was not verified by the main process' };
    }
    const result = await this.runUpdateCheck(target, true);
    return { success: result.success, error: result.error };
  }

  quitAndInstall(params?: { file_path?: string; version?: string }): void {
    log.info('Quitting and installing update...');
    recordAutoUpdateQuitAndInstall({
      currentAppVersion: app.getVersion(),
      userDataPath: app.getPath('userData'),
    });
    this.cleanupDownloadedUpdateCache(params?.file_path ? [params.file_path] : []);
    if (process.platform === 'darwin' && params?.file_path) {
      const executablePath = app.getPath('exe');
      const appBundlePath = executablePath.includes('.app/Contents/MacOS')
        ? executablePath.slice(0, executablePath.indexOf('.app/Contents/MacOS') + '.app'.length)
        : path.resolve(executablePath, '..', '..', '..');
      const plan = resolveLocalAuthorizedMacosUpdatePlan({
        appPath: appBundlePath,
        currentPid: process.pid,
        updateZipPath: params.file_path,
        userDataPath: app.getPath('userData'),
        version: params.version || app.getVersion(),
      });
      launchLocalAuthorizedMacosInstaller(plan);
      setTimeout(() => {
        app.exit(0);
      }, 250);
      return;
    }
    // On macOS, autoUpdater.quitAndInstall() closes all windows but the
    // 'window-all-closed' handler does NOT call app.quit() (standard macOS
    // behavior + close-to-tray). This leaves the process alive and Squirrel
    // cannot finish replacing the app bundle. Force-exit after a short delay
    // to let Squirrel receive the install signal.
    autoUpdater.quitAndInstall(true, true);
    setTimeout(() => {
      app.exit(0);
    }, 1000);
  }

  /**
   * Check for updates and notify (for startup)
   */
  async checkForUpdatesAndNotify(target?: AutoUpdaterReleaseTarget | null): Promise<void> {
    if (this._startupCheckStarted) return;
    this._startupCheckStarted = true;
    if (target === null) {
      this.broadcastStatus({ status: 'not-available' });
      return;
    }
    await this.runUpdateCheck(target, true);
  }
}

// Singleton instance
export const autoUpdaterService = new AutoUpdaterService();
