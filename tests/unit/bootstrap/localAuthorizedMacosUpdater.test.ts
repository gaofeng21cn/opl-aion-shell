import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLocalAuthorizedMacosInstallerScript,
  cleanupLocalAuthorizedMacosUpdaterArtifacts,
  resolveLocalAuthorizedMacosUpdatePlan,
} from '@/process/services/localAuthorizedMacosUpdater';

describe('resolveLocalAuthorizedMacosUpdatePlan', () => {
  it('builds an App-managed local authorization plan for a downloaded updater zip', () => {
    const plan = resolveLocalAuthorizedMacosUpdatePlan({
      appPath: '/Applications/One Person Lab.app',
      currentPid: 1234,
      updateZipPath: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
      userDataPath: '/Users/test/Library/Application Support/One Person Lab',
      version: '26.6.5',
    });

    expect(plan).toEqual({
      appPath: '/Applications/One Person Lab.app',
      currentPid: 1234,
      diagnosticsPath:
        '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater-diagnostics.json',
      scriptPath: '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater/install-26.6.5.sh',
      stagingRoot: '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater/staging-26.6.5',
      updateZipPath: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
      version: '26.6.5',
    });
  });
});

describe('buildLocalAuthorizedMacosInstallerScript', () => {
  it('waits for the old process, replaces the app bundle, clears quarantine, records diagnostics, and reopens', () => {
    const script = buildLocalAuthorizedMacosInstallerScript({
      appPath: '/Applications/One Person Lab.app',
      currentPid: 1234,
      diagnosticsPath:
        '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater-diagnostics.json',
      scriptPath: '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater/install-26.6.5.sh',
      stagingRoot: '/Users/test/Library/Application Support/One Person Lab/local-authorized-updater/staging-26.6.5',
      updateZipPath: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
      version: '26.6.5',
    });

    expect(script).toContain('current_pid="1234"');
    expect(script).toContain(
      'script_path="/Users/test/Library/Application Support/One Person Lab/local-authorized-updater/install-26.6.5.sh"'
    );
    expect(script).toContain('update_zip_path="/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip"');
    expect(script).toContain('trap cleanup_staging EXIT');
    expect(script).toContain('kill -0 "$current_pid"');
    expect(script).toContain('unzip -q "$update_zip_path" -d "$staging_root"');
    expect(script).toContain('find "$staging_root" -maxdepth 3 -type d -name "One Person Lab.app"');
    expect(script).toContain('app_path="/Applications/One Person Lab.app"');
    expect(script).toContain('ditto "$source_app" "$app_path"');
    expect(script).toContain('xattr -dr com.apple.quarantine "$app_path"');
    expect(script).toContain('codesign --verify --deep --strict --verbose=2 "$app_path"');
    expect(script).toContain('spctl --assess --type execute --verbose=4 "$app_path"');
    expect(script).toContain("stable_release_path: 'local_authorized_unsigned'");
    expect(script).toContain('open "$app_path"');
    expect(script).toContain('rm -f "$update_zip_path"');
    expect(script).toContain('rm -f "$script_path"');
  });
});

describe('cleanupLocalAuthorizedMacosUpdaterArtifacts', () => {
  it('bounds failed scripts and stale staging while protecting the current plan', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-local-updater-retention-'));
    const userDataPath = path.join(fixtureRoot, 'user-data');
    const plan = resolveLocalAuthorizedMacosUpdatePlan({
      appPath: '/Applications/One Person Lab.app',
      currentPid: 1234,
      updateZipPath: path.join(fixtureRoot, 'update.zip'),
      userDataPath,
      version: 'current',
    });
    const installerRoot = path.dirname(plan.scriptPath);
    const nowMs = Date.parse('2026-07-25T12:00:00Z');
    const createArtifact = (name: string, ageHours: number, directory = false) => {
      const artifactPath = path.join(installerRoot, name);
      fs.mkdirSync(directory ? artifactPath : path.dirname(artifactPath), { recursive: true });
      if (!directory) fs.writeFileSync(artifactPath, name);
      const modifiedAt = new Date(nowMs - ageHours * 60 * 60 * 1000);
      fs.utimesSync(artifactPath, modifiedAt, modifiedAt);
      return artifactPath;
    };

    try {
      const currentScript = createArtifact(path.basename(plan.scriptPath), 240);
      const retainedScript = createArtifact('install-retained.sh', 1);
      const overCountScript = createArtifact('install-over-count.sh', 2);
      const expiredScript = createArtifact('install-expired.sh', 24 * 8);
      const currentStaging = createArtifact(path.basename(plan.stagingRoot), 240, true);
      const retainedStaging = createArtifact('staging-retained', 1, true);
      const expiredStaging = createArtifact('staging-expired', 25, true);

      const result = cleanupLocalAuthorizedMacosUpdaterArtifacts(plan, {
        failedScriptMaxAgeDays: 7,
        failedScriptMaxCount: 1,
        nowMs,
        stagingMaxAgeHours: 24,
        stagingMaxCount: 1,
      });

      expect(result.retainedPaths).toEqual(
        expect.arrayContaining([currentScript, retainedScript, currentStaging, retainedStaging])
      );
      expect(result.removedPaths).toEqual(expect.arrayContaining([overCountScript, expiredScript, expiredStaging]));
      expect(fs.existsSync(currentScript)).toBe(true);
      expect(fs.existsSync(currentStaging)).toBe(true);
      expect(fs.existsSync(overCountScript)).toBe(false);
      expect(fs.existsSync(expiredScript)).toBe(false);
      expect(fs.existsSync(expiredStaging)).toBe(false);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
