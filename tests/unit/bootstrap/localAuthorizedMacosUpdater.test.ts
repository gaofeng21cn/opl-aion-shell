import { describe, expect, it } from 'vitest';
import {
  buildLocalAuthorizedMacosInstallerScript,
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
    expect(script).toContain('update_zip_path="/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip"');
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
  });
});
