import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('desktop release carrier contract', () => {
  it('keeps AionUI as the active branded carrier for the App-owned release kernel', () => {
    const carrier = JSON.parse(readFileSync(resolve(root, 'contracts/desktop-release-carrier.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const builder = readFileSync(resolve(root, 'packages/desktop/electron-builder.yml'), 'utf8');

    expect(carrier).toMatchObject({
      schema: 'opl_app_desktop_release_carrier.v1',
      owner_repo: 'gaofeng21cn/opl-aion-shell',
      carrier_id: 'aionui',
      product_name: 'One Person Lab',
      bundle_id: 'cn.onepersonlab.opl',
      release_role: 'active_stable',
      release_repository: 'gaofeng21cn/one-person-lab-app',
      package_manager: 'bun',
      artifact_name_template: 'One-Person-Lab-${env.OPL_RELEASE_VERSION}-${os}-${arch}.${ext}',
      entitlements: 'entitlements.plist',
    });
    expect(carrier.commands.build_macos).toBe('bun run build-mac:arm64');
    expect(pkg.dependencies['electron-updater']).toBe('6.8.9');
    expect(pkg.devDependencies.electron).toBe('41.10.3');
    expect(pkg.devDependencies['electron-builder']).toBe('26.15.3');
    expect(pkg.devDependencies['electron-builder-squirrel-windows']).toBe('26.15.3');
    expect(pkg.devDependencies['builder-util']).toBe('26.15.3');
    expect(builder).toMatch(/^appId: cn\.onepersonlab\.opl$/m);
    expect(builder).toMatch(/^productName: One Person Lab$/m);
    expect(builder).toMatch(/mac:\n(?:.*\n)*?  target:\n    - dmg\n    - zip\n/);
    expect(builder).toMatch(/mac:\n(?:.*\n)*?  hardenedRuntime: true\n/);
    expect(builder).toMatch(/mac:\n(?:.*\n)*?  entitlements: entitlements\.plist\n/);
    expect(builder).toContain(`artifactName: ${carrier.artifact_name_template}`);
    expect(builder).toMatch(/dmg:\n(?:.*\n)*?  format: ULFO\n/);
    expect(builder).toMatch(/publish:\n  provider: github\n  owner: gaofeng21cn\n  repo: one-person-lab-app\n/);
  });
});
