#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { buildLaunchEnv } from './launch-env.mjs';

function parseArgs(argv) {
  const flags = new Set(argv.filter((x) => x.startsWith('--')));
  const values = argv.filter((x) => !x.startsWith('--'));
  return { flags, values };
}

function buildDevFallbackArgs(projectRoot, flags, passthroughArgs) {
  const args = [path.join(projectRoot, 'scripts', 'dev-bootstrap.mjs'), 'launch', 'start'];
  if (flags.has('--opl')) {
    args.push('--opl');
  }
  if (flags.has('--examples')) {
    args.push('--examples');
  }
  args.push(...passthroughArgs);
  return args;
}

function isWindows() {
  return process.platform === 'win32';
}

const executableNames = ['One Person Lab', 'AionUi', 'aionui'];

function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function killProcessByName(name) {
  return new Promise((resolve) => {
    const args = isWindows() ? ['/F', '/IM', name] : ['-f', name];
    const cmd = isWindows() ? 'taskkill' : 'pkill';
    const child = spawn(cmd, args, { stdio: 'ignore', shell: false });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

function resolvePackagedApp(projectRoot) {
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  if (process.platform === 'win32') {
    for (const dir of ['win-unpacked', 'win-x64-unpacked', 'win-arm64-unpacked']) {
      const exe = findExecutable(executableNames.map((name) => path.join(outDir, dir, `${name}.exe`)));
      if (exe) return { executablePath: exe, cwd: path.join(outDir, dir) };
    }
  } else if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac-x64', 'mac', 'mac-universal']) {
      const macDir = path.join(outDir, dir);
      if (!fs.existsSync(macDir)) continue;
      const appBundle = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
      if (!appBundle) continue;
      const exe = findExecutable(
        executableNames.map((name) => path.join(macDir, appBundle, 'Contents', 'MacOS', name))
      );
      if (exe) return { executablePath: exe, cwd: macDir };
    }
  } else {
    for (const dir of ['linux-unpacked', 'linux-x64-unpacked', 'linux-arm64-unpacked']) {
      const dirPath = path.join(outDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      const exe = findExecutable(executableNames.map((name) => path.join(dirPath, name)));
      if (exe) return { executablePath: exe, cwd: dirPath };
    }
  }

  return null;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const dryRun = flags.has('--dry-run');
  const shouldClean = !flags.has('--no-clean');
  const passthroughArgs = values;
  const env = buildLaunchEnv(projectRoot, flags);

  const packaged = resolvePackagedApp(projectRoot);
  if (!packaged) {
    const devFallbackArgs = buildDevFallbackArgs(projectRoot, flags, passthroughArgs);
    console.log('[packaged-launch] No unpacked app found under out/. Falling back to dev mode.');
    if (flags.has('--opl')) {
      console.log('[packaged-launch] OPL GUI shell fallback: reusing the Codex-default bridge env in dev mode.');
    }
    console.log('[packaged-launch] Build a packaged app with `just build-package` to test packaged mode.');
    console.log(`[packaged-launch] dev command: ${process.execPath} ${devFallbackArgs.join(' ')}`);
    console.log(`[packaged-launch] cwd: ${projectRoot}`);
    console.log(`[packaged-launch] AIONUI_EXTENSIONS_PATH: ${env.AIONUI_EXTENSIONS_PATH || '(unset)'}`);

    if (dryRun) return;

    const child = spawn(process.execPath, devFallbackArgs, {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
    return;
  }

  if (shouldClean) {
    for (const name of executableNames) {
      await killProcessByName(`${name}.exe`);
      await killProcessByName(name);
    }
    await killProcessByName('electron.exe');
    await killProcessByName('electron');
  }

  console.log(`[packaged-launch] executable: ${packaged.executablePath}`);
  console.log(`[packaged-launch] cwd: ${packaged.cwd}`);
  if (flags.has('--opl')) {
    console.log('[packaged-launch] OPL GUI shell mode: packaged app will reuse the Codex-default bridge env.');
  }
  console.log(`[packaged-launch] AIONUI_EXTENSIONS_PATH: ${env.AIONUI_EXTENSIONS_PATH || '(unset)'}`);

  if (dryRun) return;

  const child = spawn(packaged.executablePath, passthroughArgs, {
    cwd: packaged.cwd,
    env,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[packaged-launch] Failed:', error);
  process.exit(1);
});
