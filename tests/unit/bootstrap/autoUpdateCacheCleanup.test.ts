import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupAutoUpdateCache,
  cleanupAutoUpdateCaches,
  getDefaultAutoUpdateCacheRoot,
  resolveAutoUpdateCacheCleanupPlan,
} from '@/process/services/autoUpdateCacheCleanup';

let tempRoot: string;

const writeFile = (filePath: string, content = 'data') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const exists = (filePath: string) => fs.existsSync(filePath);

describe('getDefaultAutoUpdateCacheRoot', () => {
  it('uses the macOS Caches directory expected by electron-updater', () => {
    expect(
      getDefaultAutoUpdateCacheRoot({
        appCacheDirName: 'one-person-lab-aion-shell-updater',
        homeDir: '/Users/test',
        platform: 'darwin',
      })
    ).toBe('/Users/test/Library/Caches/one-person-lab-aion-shell-updater');
  });

  it('uses LocalAppData on Windows and XDG cache on Linux', () => {
    expect(
      getDefaultAutoUpdateCacheRoot({
        appCacheDirName: 'one-person-lab-aion-shell-updater',
        env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
        homeDir: 'C:\\Users\\test',
        platform: 'win32',
      })
    ).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'one-person-lab-aion-shell-updater'));

    expect(
      getDefaultAutoUpdateCacheRoot({
        appCacheDirName: 'one-person-lab-aion-shell-updater',
        env: { XDG_CACHE_HOME: '/home/test/.cache' },
        homeDir: '/home/test',
        platform: 'linux',
      })
    ).toBe('/home/test/.cache/one-person-lab-aion-shell-updater');
  });
});

describe('resolveAutoUpdateCacheCleanupPlan', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-auto-update-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('marks stale downloaded updater packages for removal while preserving the active pending package', () => {
    const cacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const pendingZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.18-mac-arm64.zip');
    const stalePendingZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.17-mac-arm64.zip');
    const staleUpdateZip = path.join(cacheRoot, 'update.zip');
    const metadata = path.join(cacheRoot, 'pending', 'update-info.json');
    writeFile(pendingZip);
    writeFile(stalePendingZip);
    writeFile(staleUpdateZip);
    writeFile(metadata, JSON.stringify({ filePath: pendingZip }));

    const plan = resolveAutoUpdateCacheCleanupPlan({
      cacheRoot,
      keepPaths: [pendingZip],
    });

    expect(plan.removePaths.sort()).toEqual([stalePendingZip, staleUpdateZip].sort());
    expect(plan.keepPaths).toContain(pendingZip);
    expect(plan.keepPaths).toContain(metadata);
  });

  it('preserves the electron-updater pending package recorded by fileName metadata', () => {
    const cacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const pendingZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.18-mac-arm64.zip');
    const stalePendingZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.17-mac-arm64.zip');
    const metadata = path.join(cacheRoot, 'pending', 'update-info.json');
    writeFile(pendingZip);
    writeFile(stalePendingZip);
    writeFile(metadata, JSON.stringify({ fileName: path.basename(pendingZip), sha512: 'test-sha512' }));

    const plan = resolveAutoUpdateCacheCleanupPlan({
      cacheRoot,
    });

    expect(plan.removePaths).toEqual([stalePendingZip]);
    expect(plan.keepPaths).toContain(pendingZip);
    expect(plan.keepPaths).toContain(metadata);
  });

  it('does not remove files outside the updater cache root', () => {
    const cacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const outsideFile = path.join(tempRoot, 'outside.zip');
    writeFile(outsideFile);
    writeFile(path.join(cacheRoot, 'pending', 'update-info.json'), JSON.stringify({ filePath: outsideFile }));

    const plan = resolveAutoUpdateCacheCleanupPlan({
      cacheRoot,
      keepPaths: [outsideFile],
    });

    expect(plan.keepPaths).not.toContain(outsideFile);
    expect(plan.removePaths).toEqual([]);
  });
});

describe('cleanupAutoUpdateCache', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-auto-update-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('removes stale updater packages and reports deleted bytes without touching recovery metadata', () => {
    const cacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const pendingZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.18-mac-arm64.zip');
    const staleZip = path.join(cacheRoot, 'pending', 'One-Person-Lab-26.6.17-mac-arm64.zip');
    const updateZip = path.join(cacheRoot, 'update.zip');
    const metadata = path.join(cacheRoot, 'pending', 'update-info.json');
    writeFile(pendingZip, 'keep');
    writeFile(staleZip, 'remove-stale');
    writeFile(updateZip, 'remove-update');
    writeFile(metadata, JSON.stringify({ filePath: pendingZip }));

    const result = cleanupAutoUpdateCache({
      cacheRoot,
      keepPaths: [pendingZip],
    });

    expect(result.removedFiles.sort()).toEqual([staleZip, updateZip].sort());
    expect(result.removedBytes).toBe(Buffer.byteLength('remove-stale') + Buffer.byteLength('remove-update'));
    expect(exists(pendingZip)).toBe(true);
    expect(exists(metadata)).toBe(true);
    expect(exists(staleZip)).toBe(false);
    expect(exists(updateZip)).toBe(false);
  });
});

describe('cleanupAutoUpdateCaches', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-auto-update-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('preserves current pending packages while removing retired legacy updater packages', () => {
    const currentCacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const legacyCacheRoot = path.join(tempRoot, 'aionui-updater');
    const currentPendingZip = path.join(currentCacheRoot, 'pending', 'One-Person-Lab-26.6.18-mac-x64.zip');
    const currentStaleZip = path.join(currentCacheRoot, 'update.zip');
    const legacyPendingZip = path.join(legacyCacheRoot, 'pending', 'AionUi-1.9.2-mac-x64.zip');
    const legacyStaleZip = path.join(legacyCacheRoot, 'update.zip');
    const legacyNotes = path.join(legacyCacheRoot, 'notes.txt');
    const currentMetadata = path.join(currentCacheRoot, 'pending', 'update-info.json');
    const legacyMetadata = path.join(legacyCacheRoot, 'pending', 'update-info.json');
    writeFile(currentPendingZip, 'current-pending');
    writeFile(currentStaleZip, 'current-stale');
    writeFile(legacyPendingZip, 'legacy-pending');
    writeFile(legacyStaleZip, 'legacy-stale');
    writeFile(legacyNotes, 'not-an-updater-package');
    writeFile(currentMetadata, JSON.stringify({ fileName: path.basename(currentPendingZip), sha512: 'test-sha512' }));
    writeFile(legacyMetadata, JSON.stringify({ fileName: path.basename(legacyPendingZip), sha512: 'test-sha512' }));

    const result = cleanupAutoUpdateCaches({
      cacheRoots: [currentCacheRoot],
      retiredCacheRoots: [legacyCacheRoot],
    });

    expect(result.removedFiles.sort()).toEqual([currentStaleZip, legacyPendingZip, legacyStaleZip].sort());
    expect(result.removedBytes).toBe(
      Buffer.byteLength('current-stale') + Buffer.byteLength('legacy-pending') + Buffer.byteLength('legacy-stale')
    );
    expect(exists(currentStaleZip)).toBe(false);
    expect(exists(currentPendingZip)).toBe(true);
    expect(exists(legacyStaleZip)).toBe(false);
    expect(exists(legacyPendingZip)).toBe(false);
    expect(exists(currentMetadata)).toBe(true);
    expect(exists(legacyMetadata)).toBe(true);
    expect(exists(legacyNotes)).toBe(true);
  });
});
