import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const builderConfig = readFileSync(resolve(root, 'packages/desktop/electron-builder.yml'), 'utf8');
const desktopEntry = readFileSync(resolve(root, 'packages/desktop/src/index.ts'), 'utf8');

function topLevelSection(name: string): string {
  const match = builderConfig.match(new RegExp(`^${name}:\\n(?<body>(?:^[ \\t].*(?:\\n|$)|^\\s*$)*)`, 'm'));
  expect(match?.groups?.body, `${name} must be a top-level electron-builder section`).toBeTruthy();
  return match?.groups?.body ?? '';
}

describe('Linux Desktop DEB identity', () => {
  it('freezes one public x86_64 DEB name and stable installed identities', () => {
    const linux = topLevelSection('linux');
    const deb = topLevelSection('deb');

    expect(linux).toContain('- deb');
    expect(linux).toContain('executableName: one-person-lab');
    expect(linux).toContain('artifactName: One-Person-Lab-${env.OPL_RELEASE_VERSION}-linux-x64.${ext}');
    expect(deb).toContain('packageName: one-person-lab');

    expect(linux).not.toContain('${arch}');
    expect(deb).not.toContain('one-person-lab-aion-shell');
  });

  it('routes --webui through the same packaged Desktop entry', () => {
    expect(desktopEntry).toContain("const isWebUIMode = hasSwitch('webui');");
    expect(desktopEntry).toContain('} else if (isWebUIMode) {');
    expect(desktopEntry).toContain('const handle = await startWebHost({');
    expect(desktopEntry).toContain('await presentPackagedWebui(');
  });
});
