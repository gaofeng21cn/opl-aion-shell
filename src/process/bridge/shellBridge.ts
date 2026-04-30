/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const ALLOWED_OPL_COMMANDS = new Set([
  'modules',
  'doctor',
  'install',
  'module',
  'engine',
  'system',
  'workspace',
  'packages',
  'runtime',
]);
const OPL_INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh';

function assertAllowedOplArgs(args: string[]): void {
  if (args.length === 0) {
    throw new Error('Missing OPL command');
  }
  if (!ALLOWED_OPL_COMMANDS.has(args[0])) {
    throw new Error(`Unsupported OPL command: ${args[0]}`);
  }
  if (args.some((arg) => /[;&|`$<>]/.test(arg))) {
    throw new Error('Unsupported shell metacharacter in OPL command');
  }
  if (args[0] === 'module' && args[1] && !['install', 'update', 'reinstall'].includes(args[1])) {
    throw new Error(`Unsupported OPL module action: ${args[1]}`);
  }
  if (args[0] === 'engine' && args[1] && !['install', 'update', 'reinstall'].includes(args[1])) {
    throw new Error(`Unsupported OPL engine action: ${args[1]}`);
  }
  if (args[0] === 'system' && args[1] && !['initialize', 'update', 'reconcile-modules'].includes(args[1])) {
    throw new Error(`Unsupported OPL system action: ${args[1]}`);
  }
  if (args[0] === 'packages' && (args.length !== 2 || args[1] !== 'manifest')) {
    throw new Error(`Unsupported OPL packages action: ${args.slice(1).join(' ')}`);
  }
  if (args[0] === 'runtime') {
    const isSnapshot = args.length >= 2 && args[1] === 'snapshot' && args.slice(2).every((arg) => arg === '--json');
    if (!isSnapshot) {
      throw new Error(`Unsupported OPL runtime action: ${args.slice(1).join(' ')}`);
    }
  }
  if (args[0] === 'workspace') {
    const isRead = args.length === 2 && args[1] === 'root';
    const isDoctor = args.length === 3 && args[1] === 'root' && args[2] === 'doctor';
    const isSet =
      args.length === 5 && args[1] === 'root' && args[2] === 'set' && args[3] === '--path' && path.isAbsolute(args[4]);
    if (!isRead && !isDoctor && !isSet) {
      throw new Error(`Unsupported OPL workspace action: ${args.slice(1).join(' ')}`);
    }
  }
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

async function runLoginShell(
  command: string,
  timeout: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('/bin/zsh', ['-lc', command], { timeout, maxBuffer: 20 * 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
    };
  }
}

function buildOplCommand(args: string[]): string {
  const envPrefix = ['modules', 'runtime', 'system', 'workspace'].includes(args[0]) ? 'OPL_OUTPUT=json ' : '';
  return ['command -v opl >/dev/null || exit 127', `${envPrefix}${['opl', ...args].map(shellQuote).join(' ')}`].join(
    ' && '
  );
}

function buildOplBootstrapCommand(args: string[]): string {
  const envPrefix = ['modules', 'runtime', 'system', 'workspace'].includes(args[0]) ? 'OPL_OUTPUT=json ' : '';
  const commandArgs = `${envPrefix}${['opl', ...args].map(shellQuote).join(' ')}`;
  return [
    'set -euo pipefail',
    'command -v curl >/dev/null',
    `OPL_INSTALL_SCRIPT_URL="\${OPL_INSTALL_SCRIPT_URL:-${OPL_INSTALL_SCRIPT_URL}}"`,
    'OPL_BOOTSTRAP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/opl-install.XXXXXX")"',
    'trap \'rm -f "$OPL_BOOTSTRAP_SCRIPT"\' EXIT',
    'curl -fsSL "$OPL_INSTALL_SCRIPT_URL" -o "$OPL_BOOTSTRAP_SCRIPT"',
    'bash "$OPL_BOOTSTRAP_SCRIPT" --bootstrap-only',
    commandArgs,
  ].join(' && ');
}

async function runOplCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertAllowedOplArgs(args);
  const timeout =
    args[0] === 'install' ||
    args[0] === 'engine' ||
    (args[0] === 'system' && (args[1] === 'update' || args[1] === 'reconcile-modules'))
      ? 30 * 60_000
      : 120_000;
  const directResult = await runLoginShell(buildOplCommand(args), timeout);
  if (directResult.exitCode !== 127) {
    return directResult;
  }

  const bootstrapResult = await runLoginShell(buildOplBootstrapCommand(args), 30 * 60_000);
  return {
    ...bootstrapResult,
    stdout: [
      '[One Person Lab App] OPL CLI was not found; bootstrapped one-person-lab through the OPL installer.',
      bootstrapResult.stdout,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  const platform = process.platform;
  const checkCmd = platform === 'win32' ? `where ${command}` : `which ${command}`;

  try {
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if VS Code is installed
 */
async function isVSCodeInstalled(): Promise<boolean> {
  // First check if 'code' command exists
  if (await commandExists('code')) {
    return true;
  }

  // Check common installation paths
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
    possiblePaths.push('/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code');
  } else {
    // Linux
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Open folder with specified tool
 */
async function openFolderWithTool(folderPath: string, tool: 'vscode' | 'terminal' | 'explorer'): Promise<void> {
  const platform = process.platform;

  switch (tool) {
    case 'vscode': {
      const vsChild = spawn('code', [folderPath], { detached: true, stdio: 'ignore' });
      vsChild.unref();
      vsChild.on('error', async () => {
        const codePath = await findVSCodeExecutable();
        if (codePath) {
          // On Windows, .cmd/.bat files must be spawned with shell: true
          const useShell = platform === 'win32' && /\.(cmd|bat)$/i.test(codePath);
          const fallback = spawn(codePath, [folderPath], { detached: true, stdio: 'ignore', shell: useShell });
          fallback.unref();
          fallback.on('error', () => {
            shell.openPath(folderPath).catch(() => {});
          });
        } else {
          await shell.openPath(folderPath);
        }
      });
      break;
    }

    case 'terminal': {
      if (platform === 'win32') {
        // Windows: Use PowerShell via cmd /c start
        // Using 'start' command ensures PowerShell opens in a visible window
        const child = spawn(
          'cmd.exe',
          [
            '/c',
            'start',
            'powershell.exe',
            '-NoExit',
            '-Command',
            `Set-Location -LiteralPath '${folderPath.replace(/'/g, "''")}'`,
          ],
          {
            detached: true,
            windowsHide: false,
          }
        );
        child.on('error', (err) => {
          console.error('[shellBridge] Failed to spawn PowerShell:', err);
        });
        child.unref();
      } else if (platform === 'darwin') {
        // macOS: Open Terminal
        const child = spawn('open', ['-a', 'Terminal', folderPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } else {
        // Linux: Try common terminal emulators
        const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'terminator'];
        let opened = false;

        for (const term of terminals) {
          if (await commandExists(term)) {
            const args = term === 'gnome-terminal' ? [`--working-directory=${folderPath}`] : [folderPath];
            const child = spawn(term, args, { detached: true, stdio: 'ignore' });
            child.unref();
            opened = true;
            break;
          }
        }

        if (!opened) {
          // Fallback to xdg-open
          await shell.openPath(folderPath);
        }
      }
      break;
    }

    case 'explorer':
    default: {
      // Open in file explorer/finder
      if (platform === 'darwin') {
        spawn('open', [folderPath], { detached: true, stdio: 'ignore' });
      } else if (platform === 'linux') {
        spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' });
      } else {
        // Windows and fallback
        await shell.openPath(folderPath);
      }
      break;
    }
  }
}

/**
 * Find VS Code executable path
 */
async function findVSCodeExecutable(): Promise<string | null> {
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
  } else {
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return codePath;
    }
  }

  return null;
}

export function initShellBridge(): void {
  ipcBridge.shell.openFile.provider(async (path) => {
    try {
      const errorMessage = await shell.openPath(path);
      if (errorMessage) {
        console.warn(`[shellBridge] Failed to open path: ${errorMessage}`);
      }
    } catch (error) {
      console.warn(`[shellBridge] Failed to open path:`, (error as Error).message);
    }
  });

  ipcBridge.shell.showItemInFolder.provider((path) => {
    shell.showItemInFolder(path);
    return Promise.resolve();
  });

  ipcBridge.shell.openExternal.provider(async (url) => {
    try {
      new URL(url);
    } catch {
      console.warn(`[shellBridge] Invalid URL passed to openExternal: ${url}`);
      return;
    }
    try {
      await shell.openExternal(url);
    } catch (error) {
      console.warn(`[shellBridge] Failed to open external URL: ${url}`, (error as Error).message);
    }
  });

  // Check if a tool is installed
  ipcBridge.shell.checkToolInstalled.provider(async ({ tool }) => {
    switch (tool) {
      case 'vscode':
        return isVSCodeInstalled();
      case 'terminal': {
        if (process.platform === 'win32') {
          // On Windows, PowerShell is always available (or fallback to CMD)
          return true;
        }
        // Terminal is always available on macOS and Linux
        return true;
      }
      case 'explorer':
        // File explorer is always available
        return true;
      default:
        return false;
    }
  });

  ipcBridge.shell.runOplCommand.provider(async ({ args }) => runOplCli(args));

  // Open folder with specified tool
  ipcBridge.shell.openFolderWith.provider(async ({ folderPath, tool }) => {
    try {
      await openFolderWithTool(folderPath, tool);
    } catch (error) {
      console.error(`[shellBridge] Failed to open folder with ${tool}:`, error);
      // Fallback to default shell open
      await shell.openPath(folderPath);
    }
  });
}
