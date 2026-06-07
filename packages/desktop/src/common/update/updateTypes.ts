/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GitHubReleaseAsset {
  name: string;
  /** Primary download URL — rewritten to CDN for faster download. */
  url: string;
  /** Original GitHub download URL — used as fallback when CDN fails. */
  fallbackUrl?: string;
  size: number;
  contentType?: string;
  updateRole?: 'installer' | 'updater';
}

export interface UpdateReleaseInfo {
  tagName: string;
  version: string;
  name?: string;
  body?: string;
  htmlUrl: string;
  publishedAt?: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
  recommendedAsset?: GitHubReleaseAsset;
}

export interface UpdateCheckResult {
  currentVersion: string;
  updateAvailable: boolean;
  channel?: 'stable' | 'nightly';
  latest?: UpdateReleaseInfo;
}

export interface UpdateCheckRequest {
  channel?: 'stable' | 'nightly';
  includeNightly?: boolean;
  /** @deprecated Use channel or includeNightly. Kept to migrate older renderer preferences. */
  includePrerelease?: boolean;
  /** Defaults to iOfficeAI/AionUi when omitted */
  repo?: string;
}

export interface UpdateDownloadRequest {
  url: string;
  /** Fallback URL tried when the primary URL fails (e.g. CDN down). */
  fallbackUrl?: string;
  file_name?: string;
  updateRole?: 'installer' | 'updater';
}

export interface UpdateDownloadResult {
  downloadId: string;
  file_path: string;
  updateRole?: 'installer' | 'updater';
}

export interface AutoUpdateInstallRequest {
  file_path?: string;
  version?: string;
}

export type UpdateDownloadStatus = 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';

export interface UpdateDownloadProgressEvent {
  downloadId: string;
  status: UpdateDownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  file_path?: string;
  error?: string;
}

// Auto-updater status types (electron-updater)
export type AutoUpdateStatusType =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'cancelled';

export interface AutoUpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface AutoUpdateStatus {
  status: AutoUpdateStatusType;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: AutoUpdateProgress;
  error?: string;
}
