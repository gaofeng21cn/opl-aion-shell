import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('OPL release version stamping', () => {
  it('keeps display release identity separate from Electron updater metadata', () => {
    const buildScript = readRepoFile('scripts/build-with-builder.js');
    const viteConfig = readRepoFile('packages/desktop/electron.vite.config.ts');
    const packageJson = JSON.parse(readRepoFile('package.json')) as { version: string };

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    expect(packageJson.version).not.toBe('26.5.27');
    expect(buildScript).toContain('const OPL_RELEASE_VERSION_PATTERN = /^\\d+\\.\\d+\\.\\d+');
    expect(buildScript).toContain('const OPL_UPDATER_VERSION_PATTERN = /^\\d+\\.\\d+\\.\\d+');
    expect(buildScript).toContain('function buildOplReleaseVersionConfigArg()');
    expect(buildScript).toContain('return `${year}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;');
    expect(buildScript).toContain('process.env.OPL_UPDATER_VERSION = updaterVersion');
    expect(buildScript).toContain('--config.extraMetadata.version=${updaterVersion}');
    expect(buildScript).toContain('Stamping OPL App updater version: ${oplUpdaterVersion}');
    expect(buildScript).toContain('${publishArg} ${oplReleaseVersionConfigArg}');
    expect(buildScript).toContain('--prepackaged "${appPath}" --publish=never ${oplReleaseVersionConfigArg}');
    expect(viteConfig).toContain('const appReleaseVersion = injectedOplReleaseVersion || defaultOplReleaseVersion();');
    expect(viteConfig).toContain('const shellVersion = rootPackageJson.version;');
    expect(viteConfig).toContain('__APP_VERSION__: JSON.stringify(appReleaseVersion)');
    expect(viteConfig).toContain('__SHELL_VERSION__: JSON.stringify(shellVersion)');
    expect(viteConfig).toContain('__OPL_RELEASE_VERSION__: JSON.stringify(injectedOplReleaseVersion ||');
  });

  it('sets a PR build-test release version so electron-builder artifact names can expand', () => {
    const qualification = readRepoFile('.github/workflows/qualification.yml');
    const matrixPlatforms = Array.from(qualification.matchAll(/^\s+- platform: /gm));
    const releaseVersionStamps = Array.from(qualification.matchAll(/OPL_RELEASE_VERSION: '26\.5\.27-pr'/g));

    expect(qualification).toContain("OPL_RELEASE_VERSION: '26.5.27-pr'");
    expect(releaseVersionStamps).toHaveLength(matrixPlatforms.length);
  });
});
