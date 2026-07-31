/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  AutoUpdateCheckResult,
  AutoUpdateInstallRequest,
  UpdateCheckResult,
  UpdateCheckRequest,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateReleaseInfo,
  GitHubReleaseAsset,
} from '@/common/update/updateTypes';
import { uuid } from '@/common/utils';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import semver from 'semver';
import { autoUpdaterService } from '../services/autoUpdaterService';

/** Lazily loads i18n to avoid pulling in initStorage chain at module load time */
let _i18nCache: Promise<typeof import('../services/i18n')> | null = null;
const getI18n = async () => {
  if (!_i18nCache) {
    _i18nCache = import('../services/i18n');
  }
  const m = await _i18nCache;
  return m.default;
};

type GitHubReleaseApiAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
};

type GitHubReleaseApi = {
  tag_name: string;
  name?: string;
  body?: string;
  html_url: string;
  published_at?: string;
  prerelease: boolean;
  draft: boolean;
  assets?: GitHubReleaseApiAsset[];
};

type OplComponentManifest = {
  surface_kind?: string;
  component_id?: string;
  version?: string;
  release_version?: string;
  updater_version?: string;
  release_tag?: string;
  quality_status?: string;
  preview_kind?: string | null;
};

type ReleaseQuality = 'stable' | 'preview';
type ResolvedUpdateRelease = UpdateReleaseInfo & {
  qualityStatus: ReleaseQuality;
};

const DEFAULT_REPO = 'gaofeng21cn/one-person-lab-app';
const DEFAULT_USER_AGENT = 'OnePersonLabApp';
const OPL_COMPONENT_MANIFEST_NAME = 'opl-app-component-manifest.json';
const LEGACY_OPL_MACHINE_VERSION_CUTOFF = '26.7.20';
const ALLOWED_ASSET_EXTS = new Set(['.exe', '.msi', '.dmg', '.zip', '.deb', '.rpm']);
const CDN_HOST = 'static.aionui.com';
const CDN_BASE_URL = `https://${CDN_HOST}/releases`;
const ALLOWED_DOWNLOAD_HOSTS = new Set<string>([
  CDN_HOST,
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const MAX_REDIRECTS = 8;
const MAX_RELEASE_PAGES = 10;

const isAllowedAssetName = (name: string) => {
  const ext = path.extname(name);
  return ALLOWED_ASSET_EXTS.has(ext);
};

const normalizeTagToSemver = (tag: string): string | null => {
  const trimmed = tag.trim();
  const withoutV = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  // Ensure it looks like a semver prefix at least.
  if (!/^\d+\.\d+\.\d+/.test(withoutV)) return null;
  return semver.valid(withoutV);
};

const displayVersionFromTag = (tag: string): string | null => {
  const trimmed = tag.trim();
  const displayVersion = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(displayVersion) ? displayVersion : null;
};

const legacyOplTagFallback = (displayVersion: string): string | null => {
  if (/-r[1-9][0-9]*$/.test(displayVersion)) return null;
  const calendarVersion = displayVersion.split('-')[0];
  if (
    !calendarVersion ||
    !semver.valid(calendarVersion) ||
    semver.gt(calendarVersion, LEGACY_OPL_MACHINE_VERSION_CUTOFF)
  ) {
    return null;
  }
  return normalizeTagToSemver(displayVersion);
};

const fetchOplComponentManifest = async (asset: GitHubReleaseApiAsset): Promise<OplComponentManifest | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(asset.browser_download_url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === 'object' ? (payload as OplComponentManifest) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveReleaseVersions = async (
  rel: GitHubReleaseApi,
  requireOplManifest: boolean
): Promise<{ displayVersion: string; updaterVersion: string; qualityStatus: ReleaseQuality } | null> => {
  const displayVersion = displayVersionFromTag(rel.tag_name);
  if (!displayVersion) return null;

  if (!requireOplManifest) {
    const updaterVersion = normalizeTagToSemver(rel.tag_name);
    return updaterVersion
      ? { displayVersion, updaterVersion, qualityStatus: rel.prerelease ? 'preview' : 'stable' }
      : null;
  }

  const manifestAsset = rel.assets?.find((asset) => asset.name === OPL_COMPONENT_MANIFEST_NAME);
  if (!manifestAsset) {
    const updaterVersion = legacyOplTagFallback(displayVersion);
    return updaterVersion
      ? { displayVersion, updaterVersion, qualityStatus: rel.prerelease ? 'preview' : 'stable' }
      : null;
  }
  const manifest = await fetchOplComponentManifest(manifestAsset);
  const updaterVersion = manifest?.updater_version ? semver.valid(manifest.updater_version) : null;
  const qualityStatus =
    manifest?.quality_status === 'stable' || manifest?.quality_status === 'preview' ? manifest.quality_status : null;
  if (
    manifest?.surface_kind !== 'opl_app_component_manifest.v1' ||
    manifest.component_id !== 'opl-app' ||
    manifest.version !== displayVersion ||
    manifest.release_version !== displayVersion ||
    manifest.release_tag !== `v${displayVersion}` ||
    !updaterVersion ||
    !qualityStatus
  ) {
    return null;
  }
  return { displayVersion, updaterVersion, qualityStatus };
};

/**
 * Rewrite a GitHub release asset URL to the CDN URL for faster download.
 * The CDN path follows the fixed convention `{base}/{version}/{original-filename}`,
 * matching electron-builder's artifactName output, so no name conversion is needed.
 */
const rewriteAssetUrlToCDN = (assetName: string, version: string): string => {
  return `${CDN_BASE_URL}/${version}/${assetName}`;
};

const mapAsset = (asset: GitHubReleaseApiAsset, version: string): GitHubReleaseAsset => ({
  name: asset.name,
  url: rewriteAssetUrlToCDN(asset.name, version),
  fallbackUrl: asset.browser_download_url,
  size: asset.size,
  contentType: asset.content_type,
});

type RuntimePlatformInfo = {
  platform: NodeJS.Platform;
  arch: string;
};

type CanonicalArch = 'x64' | 'arm64' | 'ia32';

const normalizeArch = (arch: string): CanonicalArch => {
  if (arch === 'arm64') return 'arm64';
  if (arch === 'ia32' || arch === 'x32') return 'ia32';
  return 'x64';
};

const detectAssetArchs = (nameLower: string): Set<CanonicalArch> => {
  const detected = new Set<CanonicalArch>();

  if (/\b(arm64|aarch64)\b/.test(nameLower)) detected.add('arm64');
  if (/\b(x64|x86_64|amd64)\b/.test(nameLower)) detected.add('x64');

  const hasX86Token = /\bx86\b/.test(nameLower) && !/\bx86[_-]?64\b/.test(nameLower);
  if (/\b(ia32|x32|32bit)\b/.test(nameLower) || hasX86Token) detected.add('ia32');

  return detected;
};

const getPlatformHints = (runtime: RuntimePlatformInfo = { platform: process.platform, arch: process.arch }) => {
  const platform = runtime.platform;
  const arch = runtime.arch;
  const normalizedArch = normalizeArch(arch);

  const archHints =
    normalizedArch === 'arm64'
      ? ['arm64', 'aarch64']
      : normalizedArch === 'ia32'
        ? ['ia32', 'x86', 'x32', '32bit']
        : ['x64', 'x86_64', 'amd64'];

  // electron-builder artifact names often include one of these
  const platformHints =
    platform === 'win32' ? ['win', 'win32', 'windows'] : platform === 'darwin' ? ['mac', 'darwin', 'osx'] : ['linux'];

  return { platform, arch, normalizedArch, archHints, platformHints };
};

const scoreAsset = (asset: GitHubReleaseAsset, runtime?: RuntimePlatformInfo): number => {
  const { platform, normalizedArch, archHints, platformHints } = getPlatformHints(runtime);
  const nameLower = asset.name.toLowerCase();
  const ext = path.extname(asset.name);

  const detectedArchs = detectAssetArchs(nameLower);
  if (detectedArchs.size > 0 && !detectedArchs.has(normalizedArch)) {
    return -1;
  }

  let score = 0;

  // Platform match
  if (platformHints.some((hint) => nameLower.includes(hint))) score += 20;

  // Arch match
  if (archHints.some((hint) => nameLower.includes(hint))) score += 10;
  if (detectedArchs.has(normalizedArch)) score += 15;

  // Prefer installer formats per platform
  if (platform === 'win32') {
    if (ext === '.exe') score += 100;
    if (ext === '.msi') score += 90;
    if (ext === '.zip') score += 50;
  } else if (platform === 'darwin') {
    if (ext === '.zip') score += 100;
    if (ext === '.dmg') score += 70;
  } else {
    if (ext === '.deb') score += 100;
    if (ext === '.rpm') score += 80;
    if (ext === '.zip') score += 40;
  }

  return score;
};

export const pickRecommendedAsset = (
  assets: GitHubReleaseAsset[],
  runtime?: RuntimePlatformInfo
): GitHubReleaseAsset | undefined => {
  if (!assets.length) return undefined;

  const scored = assets
    .map((asset) => ({ asset, score: scoreAsset(asset, runtime) }))
    .filter((item) => item.score >= 0)
    .toSorted((a, b) => b.score - a.score);

  const asset = scored[0]?.asset;
  if (!asset) return undefined;
  const { platform } = getPlatformHints(runtime);
  return {
    ...asset,
    updateRole: platform === 'darwin' && path.extname(asset.name).toLowerCase() === '.zip' ? 'updater' : 'installer',
  };
};

const resolveRepo = (requestRepo?: string): string => {
  const envRepo = process.env.AIONUI_GITHUB_REPO?.trim();
  const repo = (requestRepo || envRepo || DEFAULT_REPO).trim();
  return repo || DEFAULT_REPO;
};

const assertAllowedUrl = async (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error((await getI18n()).t('update.errors.invalidUrl'));
  }

  if (parsed.protocol !== 'https:') {
    throw new Error((await getI18n()).t('update.errors.httpsOnly'));
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
    throw new Error((await getI18n()).t('update.errors.hostNotAllowed', { host: parsed.hostname }));
  }
};

const fetchWithAllowlistedRedirects = async (rawUrl: string, signal: AbortSignal): Promise<Response> => {
  let current = rawUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertAllowedUrl(current);

    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error((await getI18n()).t('update.errors.redirectNoLocation'));
      }
      current = new URL(location, current).toString();
      continue;
    }

    return res;
  }

  throw new Error((await getI18n()).t('update.errors.tooManyRedirects'));
};

const fetchGitHubReleasePage = async (url: string): Promise<{ payload: unknown; hasNext: boolean }> => {
  // 添加超时控制，防止网络问题导致无限等待 / Add timeout to prevent infinite wait on network issues
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时 / 30 second timeout

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error((await getI18n()).t('update.errors.githubApiFailed', { status: res.status }));
    }

    const linkHeader = res.headers?.get?.('link') ?? '';
    return {
      payload: (await res.json()) as unknown,
      hasNext: linkHeader.split(',').some((part) => part.includes('rel="next"')),
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error((await getI18n()).t('update.errors.githubApiTimeout'), { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchGitHubReleases = async (repo: string): Promise<GitHubReleaseApi[]> => {
  const releases: GitHubReleaseApi[] = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const { payload, hasNext } = await fetchGitHubReleasePage(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`
    );
    if (!Array.isArray(payload)) {
      throw new Error((await getI18n()).t('update.errors.githubApiNotArray'));
    }
    releases.push(...(payload as GitHubReleaseApi[]));
    if (!hasNext) return releases;
  }
  throw new Error(`GitHub release pagination exceeded ${MAX_RELEASE_PAGES} pages`);
};

const mapRelease = async (
  rel: GitHubReleaseApi,
  requireOplManifest: boolean
): Promise<ResolvedUpdateRelease | null> => {
  const versions = await resolveReleaseVersions(rel, requireOplManifest);
  if (!versions) return null;

  const assets = (rel.assets || [])
    .filter((asset) => asset && asset.name && asset.browser_download_url)
    .filter((asset) => isAllowedAssetName(asset.name))
    .map((asset) => mapAsset(asset, versions.displayVersion));

  return {
    tagName: rel.tag_name,
    version: versions.displayVersion,
    updaterVersion: versions.updaterVersion,
    name: rel.name,
    body: rel.body,
    htmlUrl: rel.html_url,
    publishedAt: rel.published_at,
    prerelease: Boolean(rel.prerelease),
    draft: Boolean(rel.draft),
    qualityStatus: versions.qualityStatus,
    assets,
    recommendedAsset: pickRecommendedAsset(assets),
  };
};

export async function resolveUpdateCheck(
  params: UpdateCheckRequest = {},
  currentVersion = app.getVersion()
): Promise<UpdateCheckResult> {
  const repo = resolveRepo(params.repo);
  const includePreview = params.channel === 'nightly' || Boolean(params.includeNightly ?? params.includePrerelease);
  const releases = await fetchGitHubReleases(repo);
  const candidates = (
    await Promise.all(
      releases
        .filter((release) => release && !release.draft)
        .map((release) => mapRelease(release, repo === DEFAULT_REPO))
    )
  ).filter((release): release is ResolvedUpdateRelease => Boolean(release));
  const eligibleCandidates = includePreview
    ? candidates
    : candidates.filter((release) => release.qualityStatus === 'stable');

  const currentSemver = semver.valid(currentVersion) || semver.coerce(currentVersion)?.version;
  if (!currentSemver) {
    return { currentVersion, updateAvailable: false };
  }

  const latestResolved = eligibleCandidates
    .filter((release) => semver.valid(release.updaterVersion))
    .toSorted((a, b) => semver.rcompare(a.updaterVersion, b.updaterVersion))[0];
  if (!latestResolved) {
    return { currentVersion, updateAvailable: false };
  }

  const { qualityStatus: _qualityStatus, ...latest } = latestResolved;
  return {
    currentVersion,
    updateAvailable: semver.gt(latest.updaterVersion, currentSemver),
    channel: includePreview ? 'nightly' : 'stable',
    latest,
  };
}

type DownloadState = {
  abortController: AbortController;
  file_path: string;
};

const downloads = new Map<string, DownloadState>();

const sanitizeFileName = (name: string): string => {
  // Keep only base name and trim weird whitespace.
  const base = path.basename(name).trim();
  // Avoid empty names.
  return base || `One-Person-Lab-update-${Date.now()}`;
};

const ensureUniquePath = (target: string): string => {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i++) {
    const next = path.join(dir, `${base} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
};

const emitProgress = (evt: UpdateDownloadProgressEvent) => {
  ipcBridge.update.downloadProgress.emit(evt);
};

type DownloadAttempt = {
  ok: boolean;
  isAbort: boolean;
  message: string;
  receivedBytes: number;
  totalBytes?: number;
};

/**
 * Attempt to download from a single URL into `file_path`.
 * Emits `starting`/`downloading` progress events but NOT the terminal
 * completed/error/cancelled events — the caller decides whether to retry
 * or surface the final state.
 */
const attemptDownload = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController
): Promise<DownloadAttempt> => {
  let receivedBytes = 0;
  let totalBytes: number | undefined;

  const startedAt = Date.now();
  let lastEmitAt = 0;

  const emitThrottled = (status: UpdateDownloadProgressEvent['status']) => {
    const now = Date.now();
    const shouldEmit = now - lastEmitAt >= 250 || status !== 'downloading';
    if (!shouldEmit) return;

    const elapsedSec = Math.max(0.001, (now - startedAt) / 1000);
    const bytesPerSecond = receivedBytes / elapsedSec;
    const percent = totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : undefined;

    lastEmitAt = now;
    emitProgress({
      downloadId,
      status,
      receivedBytes,
      totalBytes,
      percent,
      bytesPerSecond,
    });
  };

  emitThrottled('starting');

  let stream: fs.WriteStream | null = null;
  try {
    const res = await fetchWithAllowlistedRedirects(url, abortController.signal);

    if (!res.ok) {
      throw new Error((await getI18n()).t('update.errors.downloadFailed', { status: res.status }));
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const parsed = parseInt(contentLengthHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalBytes = parsed;
      }
    }

    if (!res.body) {
      throw new Error((await getI18n()).t('update.errors.downloadNoBody'));
    }

    stream = fs.createWriteStream(file_path);
    const reader = res.body.getReader();

    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      doneReading = done;
      if (doneReading) break;
      if (!value) continue;

      receivedBytes += value.byteLength;

      const buf = Buffer.from(value);
      if (!stream.write(buf)) {
        await new Promise<void>((resolve) => stream?.once('drain', () => resolve()));
      }

      emitThrottled('downloading');
    }

    await new Promise<void>((resolve, reject) => {
      if (!stream) {
        resolve();
        return;
      }
      stream.end(() => resolve());
      stream.on('error', reject);
    });

    return { ok: true, isAbort: false, message: '', receivedBytes, totalBytes };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = abortController.signal.aborted || message.toLowerCase().includes('aborted');

    try {
      stream?.close();
    } catch {
      // ignore
    }

    // Remove partial file before retrying or reporting failure.
    try {
      if (fs.existsSync(file_path)) {
        fs.rmSync(file_path, { force: true });
      }
    } catch {
      // ignore
    }

    return { ok: false, isAbort, message, receivedBytes, totalBytes };
  }
};

const startDownloadInBackground = async (
  downloadId: string,
  url: string,
  file_path: string,
  abortController: AbortController,
  fallbackUrl?: string
) => {
  const runWithFallback = async (): Promise<DownloadAttempt> => {
    const primary = await attemptDownload(downloadId, url, file_path, abortController);
    if (primary.ok) return primary;
    if (primary.isAbort) return primary;
    if (!fallbackUrl || fallbackUrl === url) return primary;

    try {
      await assertAllowedUrl(fallbackUrl);
    } catch (err) {
      // Fallback URL itself is invalid — keep the primary failure result.
      console.warn('[updateBridge] Fallback URL rejected by allowlist:', err);
      return primary;
    }

    console.warn(`[updateBridge] Primary download failed (${primary.message}). Retrying with fallback URL.`);
    return attemptDownload(downloadId, fallbackUrl, file_path, abortController);
  };

  const finalResult = await runWithFallback();

  try {
    if (finalResult.ok) {
      emitProgress({
        downloadId,
        status: 'completed',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        percent: finalResult.totalBytes
          ? Math.min(100, (finalResult.receivedBytes / finalResult.totalBytes) * 100)
          : undefined,
        file_path,
      });
    } else {
      emitProgress({
        downloadId,
        status: finalResult.isAbort ? 'cancelled' : 'error',
        receivedBytes: finalResult.receivedBytes,
        totalBytes: finalResult.totalBytes,
        error: finalResult.message,
      });
    }
  } finally {
    downloads.delete(downloadId);
  }
};

/**
 * Create a status broadcast callback that sends updates via ipcBridge.autoUpdate.status.emit.
 * This is a pure emitter: it does not bind to any specific window.
 * The ipcBridge channel broadcasts to all renderer listeners, so no window guard is needed here.
 */
export function createAutoUpdateStatusBroadcast(): (
  status: import('../services/autoUpdaterService').AutoUpdateStatus
) => void {
  return (status) => {
    ipcBridge.autoUpdate.status.emit(status);
  };
}

export function initUpdateBridge(): void {
  ipcBridge.autoUpdate.getStatusSnapshot.provider(() => Promise.resolve(autoUpdaterService.getStatusSnapshot()));

  ipcBridge.update.check.provider(
    async (params): Promise<{ success: boolean; data?: UpdateCheckResult; msg?: string }> => {
      try {
        return { success: true, data: await resolveUpdateCheck(params) };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.update.download.provider(
    async (params: UpdateDownloadRequest): Promise<{ success: boolean; data?: UpdateDownloadResult; msg?: string }> => {
      try {
        if (!params?.url) {
          return { success: false, msg: (await getI18n()).t('update.errors.missingUrl') };
        }

        // Defense-in-depth: do not allow arbitrary downloads from renderer.
        // EN: Only allowlisted hosts (CDN + GitHub release hosts) are permitted;
        // each redirect hop is re-validated against the allowlist.
        // 中文：仅允许白名单内的域名（CDN + GitHub release 相关），并手动处理重定向，每一跳都校验白名单。
        await assertAllowedUrl(params.url);
        if (params.fallbackUrl) {
          await assertAllowedUrl(params.fallbackUrl);
        }

        const downloadId = uuid();
        const abortController = new AbortController();

        const downloadsDir = app.getPath('downloads');
        const urlObj = new URL(params.url);
        const urlName = path.basename(urlObj.pathname);
        const baseName = sanitizeFileName(params.file_name || urlName);

        const targetPath = ensureUniquePath(path.join(downloadsDir, baseName));
        downloads.set(downloadId, { abortController, file_path: targetPath });

        // Start background download, but return immediately so the UI stays responsive.
        void startDownloadInBackground(downloadId, params.url, targetPath, abortController, params.fallbackUrl);

        return Promise.resolve({
          success: true,
          data: {
            downloadId,
            file_path: targetPath,
            updateRole: params.updateRole,
          },
        });
      } catch (err: unknown) {
        return Promise.resolve({ success: false, msg: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Auto-updater IPC handlers (electron-updater)
  ipcBridge.autoUpdate.check.provider(
    async (
      params
    ): Promise<{
      success: boolean;
      data?: AutoUpdateCheckResult;
      msg?: string;
    }> => {
      try {
        const decision = await resolveUpdateCheck(params);
        if (!decision.updateAvailable || !decision.latest) {
          return { success: true, data: { checked: true, decision } };
        }
        const target = {
          repo: DEFAULT_REPO,
          tagName: decision.latest.tagName,
          updaterVersion: decision.latest.updaterVersion,
        };
        const result = await autoUpdaterService.checkForUpdates(target);
        if (result.success && result.updateInfo) {
          // autoUpdaterService.checkForUpdates() only returns updateInfo when
          // electron-updater confirms isUpdateAvailable, so we can trust it directly.
          return {
            success: true,
            data: {
              checked: true,
              decision,
              target,
              updateInfo: {
                version: result.updateInfo.version,
                releaseDate: result.updateInfo.releaseDate,
                releaseNotes:
                  typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined,
              },
            },
          };
        }
        return { success: result.success, data: { checked: true, decision, target }, msg: result.error };
      } catch (err: unknown) {
        return { success: false, msg: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcBridge.autoUpdate.download.provider(async (target): Promise<{ success: boolean; msg?: string }> => {
    try {
      const result = await autoUpdaterService.downloadUpdate(target);
      return { success: result.success, msg: result.error };
    } catch (err: unknown) {
      return { success: false, msg: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.autoUpdate.quitAndInstall.provider(async (params: AutoUpdateInstallRequest): Promise<void> => {
    try {
      autoUpdaterService.quitAndInstall(params);
    } catch (err: unknown) {
      console.error('quitAndInstall failed:', err);
    }
  });
}
