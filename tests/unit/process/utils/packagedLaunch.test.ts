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

function createOplWorkspaceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'cli.ts'), '', 'utf8');
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
    const oplWorkspaceRoot = createOplWorkspaceRoot();
    fs.mkdirSync(path.join(projectRoot, 'examples', 'opl-acp-adapter-extension'), { recursive: true });

    const output = runPackagedLaunch(projectRoot, ['--dry-run', '--opl'], {
      OPL_ACP_WORKSPACE_ROOT: oplWorkspaceRoot,
    });
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
    const packagedExecutable =
      process.platform === 'win32'
        ? path.join(projectRoot, 'out', 'win-unpacked', 'AionUi.exe')
        : process.platform === 'darwin'
          ? path.join(projectRoot, 'out', 'mac', 'AionUi.app', 'Contents', 'MacOS', 'AionUi')
          : path.join(projectRoot, 'out', 'linux-unpacked', 'AionUi');
    fs.mkdirSync(path.dirname(packagedExecutable), { recursive: true });
    fs.writeFileSync(packagedExecutable, '');
    fs.chmodSync(packagedExecutable, 0o755);
    const canonicalExecutable = canonicalPath(packagedExecutable);

    const output = runPackagedLaunch(projectRoot, ['--dry-run'], {
      AIONUI_EXTENSIONS_PATH: '/tmp/should-not-leak',
    });

    expect(output).toContain(`[packaged-launch] executable: ${canonicalExecutable}`);
    expect(output).not.toContain('Falling back to dev mode');
    expect(output).toContain('AIONUI_EXTENSIONS_PATH: (unset)');
  });
});
