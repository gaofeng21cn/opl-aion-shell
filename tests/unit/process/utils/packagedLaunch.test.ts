import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = path.resolve(process.cwd(), 'scripts/packaged-launch.mjs');
const tempRoots: string[] = [];

function createProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-packaged-launch-'));
  tempRoots.push(root);
  return root;
}

function canonicalPath(targetPath: string) {
  const parent = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);
  const resolvedParent = fs.realpathSync(parent);
  if (parent === targetPath) {
    return resolvedParent;
  }
  return path.join(resolvedParent, path.basename(targetPath));
}

function runPackagedLaunch(cwd: string, args: string[] = [], envOverrides: Record<string, string> = {}) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: {
      ...process.env,
      ...envOverrides,
    },
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/packaged-launch', () => {
  it('falls back to dev bootstrap when no unpacked app exists', () => {
    const projectRoot = createProjectRoot();
    fs.mkdirSync(path.join(projectRoot, 'examples', 'opl-acp-adapter-extension'), { recursive: true });

    const output = runPackagedLaunch(projectRoot, ['--dry-run', '--opl']);
    const canonicalProjectRoot = canonicalPath(projectRoot);

    expect(output).toContain('No unpacked app found under out/. Falling back to dev mode.');
    expect(output).toContain(
      `dev command: ${process.execPath} ${path.join(canonicalProjectRoot, 'scripts', 'dev-bootstrap.mjs')} launch start --opl`
    );
    expect(output).toContain(
      `AIONUI_EXTENSIONS_PATH: ${path.join(canonicalProjectRoot, 'examples', 'opl-acp-adapter-extension')}`
    );
  });

  it('keeps packaged mode and clears inherited extension paths by default', () => {
    const projectRoot = createProjectRoot();
    const packagedExecutable = path.join(projectRoot, 'out', 'mac', 'AionUi.app', 'Contents', 'MacOS', 'AionUi');
    fs.mkdirSync(path.dirname(packagedExecutable), { recursive: true });
    fs.writeFileSync(packagedExecutable, '');
    const canonicalExecutable = canonicalPath(packagedExecutable);

    const output = runPackagedLaunch(projectRoot, ['--dry-run'], {
      AIONUI_EXTENSIONS_PATH: '/tmp/should-not-leak',
    });

    expect(output).toContain(`[packaged-launch] executable: ${canonicalExecutable}`);
    expect(output).not.toContain('Falling back to dev mode');
    expect(output).toContain('AIONUI_EXTENSIONS_PATH: (unset)');
  });
});
