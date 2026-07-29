import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __windowsWslProvisionerTest,
  validateWindowsWslGuestIdentity,
  validateWindowsWslProductManifest,
  WindowsWslProvisioner,
  WindowsWslProvisioningError,
  type WindowsWslCommandResult,
} from '../../../packages/desktop/src/process/services/windows-wsl/provisioner';

function result(exitCode: number, stdout = '', stderr = ''): WindowsWslCommandResult {
  return { exitCode, stdout, stderr, timedOut: false };
}

let packagedBootstrapDigest = `sha256:${'5'.repeat(64)}`;

function identity() {
  return {
    schema: 'opl_linux_runtime_inspection.v1',
    protocol_version: 1,
    logical_distribution: 'OPL-Linux',
    physical_distribution: 'OPL-Linux',
    distribution_generation: 1,
    guest_install_id: 'guest-1',
    architecture: 'x86_64',
    guest_user: 'opl',
    carrier_activation_digest: `sha256:${'1'.repeat(64)}`,
    bootstrap_digest: packagedBootstrapDigest,
    aioncore_digest: `sha256:${'2'.repeat(64)}`,
    codex_digest: `sha256:${'3'.repeat(64)}`,
    codex_path: '/opt/opl/carrier/store/sha256/activation/managed-resources/codex',
    codex_command_path: '/usr/local/bin/codex',
    codex_realpath: '/opt/opl/carrier/store/sha256/activation/managed-resources/codex',
    codex_command_digest: `sha256:${'3'.repeat(64)}`,
    codex_home: '/home/opl/.codex',
    workspace_root: '/home/opl/code',
    framework_path: '/home/opl/.opl/one-person-lab/bin/opl',
    framework_digest: `sha256:${'4'.repeat(64)}`,
    framework_ref: 'a'.repeat(40),
    native_windows_executor_fallback_allowed: false,
    wsl2: true,
    active_operation_count: 0,
  };
}

describe('WindowsWslProvisioner parsing and identity', () => {
  let userDataPath: string;
  let resourcesPath: string;

  beforeEach(() => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wsl-provisioner-'));
    userDataPath = path.join(tempRoot, 'OPL-RC-Acceptance', '30324758135', 'user-data');
    resourcesPath = path.join(userDataPath, 'resources');
    const bootstrapRoot = path.join(resourcesPath, 'opl-linux', 'bootstrap');
    fs.mkdirSync(bootstrapRoot, { recursive: true });
    for (const name of ['opl-runtime-control', 'opl-runtime-exec', 'opl-runtime-inspect']) {
      fs.writeFileSync(path.join(bootstrapRoot, name), `${name}\n`);
    }
    packagedBootstrapDigest = __windowsWslProvisionerTest.computePackagedBootstrapDigest(bootstrapRoot);
    const frameworkRef = 'a'.repeat(40);
    fs.writeFileSync(
      path.join(resourcesPath, 'opl-linux', 'product.json'),
      JSON.stringify({
        schema: 'opl_linux_product_manifest.v1',
        logical_distribution: 'OPL-Linux',
        physical_distribution: 'OPL-Linux',
        wsl_version: 2,
        architecture: 'x86_64',
        guest_user: 'opl',
        codex_home: '/home/opl/.codex',
        workspace_root: '/home/opl/code',
        framework_ref: frameworkRef,
        framework_install_script_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkRef}/install.sh`,
        framework_source_archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkRef}.tar.gz`,
        native_windows_executor_fallback_allowed: false,
      })
    );
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it('parses the current Windows online catalog name', () => {
    const output =
      'NAME                            FRIENDLY NAME\r\n' +
      'Ubuntu-24.04                   Ubuntu 24.04 LTS\r\n' +
      'Debian                         Debian GNU/Linux\r\n';
    expect([...__windowsWslProvisionerTest.parseOnlineDistributionNames(output)]).toEqual(['Ubuntu-24.04', 'Debian']);
  });

  it('decodes redirected UTF-16LE WSL output without corrupting UTF-8 output', () => {
    const utf16 = Buffer.from('Wsl/WININET_E_CANNOT_CONNECT\r\n', 'utf16le');
    expect(__windowsWslProvisionerTest.decodeWindowsCommandOutput([utf16])).toContain('WININET_E_CANNOT_CONNECT');
    expect(__windowsWslProvisionerTest.decodeWindowsCommandOutput([Buffer.from('Ubuntu-24.04\n', 'utf8')])).toBe(
      'Ubuntu-24.04\n'
    );
  });

  it('requires a non-negative active operation count', () => {
    expect(validateWindowsWslGuestIdentity(identity()).active_operation_count).toBe(0);
    expect(() => validateWindowsWslGuestIdentity({ ...identity(), active_operation_count: -1 })).toThrow(
      WindowsWslProvisioningError
    );
  });

  it('requires the inspected Codex command to match the packaged identity', () => {
    expect(() =>
      validateWindowsWslGuestIdentity({
        ...identity(),
        codex_command_digest: `sha256:${'8'.repeat(64)}`,
      })
    ).toThrow(WindowsWslProvisioningError);
  });

  it('binds the Framework URLs to the exact product ref', () => {
    const frameworkRef = 'b'.repeat(40);
    expect(
      validateWindowsWslProductManifest({
        schema: 'opl_linux_product_manifest.v1',
        logical_distribution: 'OPL-Linux',
        physical_distribution: 'OPL-Linux',
        wsl_version: 2,
        architecture: 'x86_64',
        guest_user: 'opl',
        codex_home: '/home/opl/.codex',
        workspace_root: '/home/opl/code',
        framework_ref: frameworkRef,
        framework_install_script_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkRef}/install.sh`,
        framework_source_archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkRef}.tar.gz`,
        native_windows_executor_fallback_allowed: false,
      }).framework_ref
    ).toBe(frameworkRef);
  });

  it('continues without a restart when WSL is ready after feature enablement', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    let statusCalls = 0;
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      calls.push({ command, args });
      if (command === 'powershell.exe') {
        if (args.join(' ').includes('CurrentVersion\\Lxss')) {
          return result(
            0,
            JSON.stringify({
              distribution_name: 'OPL-Linux',
              base_path: path.join(userDataPath, 'wsl', 'OPL-Linux'),
            })
          );
        }
        return result(0);
      }
      if (args.join(' ') === '--status') {
        statusCalls += 1;
        return result(statusCalls === 1 ? 1 : 0);
      }
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        return result(0, JSON.stringify(identity()));
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      logical_distribution: 'OPL-Linux',
      wsl2: true,
    });
    expect(calls.some((call) => call.command === 'powershell.exe')).toBe(true);
  });

  it('resumes a partially initialized distribution only from the App-owned data directory', async () => {
    let inspectCalls = 0;
    let bootstrapCalls = 0;
    const expectedBasePath = path.join(userDataPath, 'wsl', 'OPL-Linux');
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: expectedBasePath,
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      if (args.includes('wslpath')) {
        return result(0, `/mnt/d/opl/${path.basename(args.at(-1) ?? 'resource')}\n`);
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        inspectCalls += 1;
        return inspectCalls === 1 ? result(1, '', 'identity missing') : result(0, JSON.stringify(identity()));
      }
      if (args.includes('/etc/opl/identity.json')) return result(1);
      if (args.some((value) => value.endsWith('/install-opl-linux.sh'))) {
        bootstrapCalls += 1;
        return result(0);
      }
      if (args.includes('/opt/opl/bootstrap/opl-install.sh')) return result(0);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      logical_distribution: 'OPL-Linux',
      wsl2: true,
    });
    expect(bootstrapCalls).toBe(1);
    expect(
      runCommand.mock.calls.some(
        ([command, args]) => command === 'powershell.exe' && args.join(' ').includes('CurrentVersion\\Lxss')
      )
    ).toBe(true);
  });

  it('repairs stale guest runtime entrypoints against the packaged cohort', async () => {
    let inspectCalls = 0;
    let bootstrapCalls = 0;
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: path.join(userDataPath, 'wsl', 'OPL-Linux'),
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Running         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        inspectCalls += 1;
        return result(
          0,
          JSON.stringify({
            ...identity(),
            bootstrap_digest: inspectCalls === 1 ? `sha256:${'9'.repeat(64)}` : packagedBootstrapDigest,
          })
        );
      }
      if (args.includes('/etc/opl/identity.json')) return result(0);
      if (args.includes('wslpath')) {
        return result(0, `/mnt/d/opl/${path.basename(args.at(-1) ?? 'resource')}\n`);
      }
      if (args.some((value) => value.endsWith('/install-opl-linux.sh'))) {
        bootstrapCalls += 1;
        return result(0);
      }
      if (args.includes('/opt/opl/bootstrap/opl-install.sh')) return result(0);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      bootstrap_digest: packagedBootstrapDigest,
    });
    expect(bootstrapCalls).toBe(1);
    const frameworkActivation = runCommand.mock.calls.find(([, args]) =>
      args.includes('/opt/opl/bootstrap/opl-install.sh')
    );
    expect(frameworkActivation?.[1]).toEqual(
      expect.arrayContaining([
        'HOME=/home/opl',
        'CODEX_HOME=/home/opl/.codex',
        'OPL_CODEX_BIN=/usr/local/bin/codex',
        'OPL_WORKSPACE_ROOT=/home/opl/code',
      ])
    );
  });

  it('repairs a stale Framework ref even when the bootstrap digest is current', async () => {
    let inspectCalls = 0;
    let bootstrapCalls = 0;
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: path.join(userDataPath, 'wsl', 'OPL-Linux'),
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Running         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        inspectCalls += 1;
        return result(
          0,
          JSON.stringify({
            ...identity(),
            framework_ref: inspectCalls === 1 ? 'b'.repeat(40) : 'a'.repeat(40),
          })
        );
      }
      if (args.includes('/etc/opl/identity.json')) return result(0);
      if (args.includes('wslpath')) {
        return result(0, `/mnt/d/opl/${path.basename(args.at(-1) ?? 'resource')}\n`);
      }
      if (args.some((value) => value.endsWith('/install-opl-linux.sh'))) {
        bootstrapCalls += 1;
        return result(0);
      }
      if (args.includes('/opt/opl/bootstrap/opl-install.sh')) return result(0);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      framework_ref: 'a'.repeat(40),
    });
    expect(bootstrapCalls).toBe(1);
  });

  it('repairs a stale Framework ref from an older App-owned path', async () => {
    let inspectCalls = 0;
    let bootstrapCalls = 0;
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: path.join(path.dirname(path.dirname(userDataPath)), '30286627648', 'wsl', 'OPL-Linux'),
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        inspectCalls += 1;
        return result(
          0,
          JSON.stringify({
            ...identity(),
            framework_ref: inspectCalls < 3 ? 'b'.repeat(40) : 'a'.repeat(40),
          })
        );
      }
      if (args.includes('/etc/opl/identity.json')) return result(0);
      if (args.includes('wslpath')) {
        return result(0, `/mnt/d/opl/${path.basename(args.at(-1) ?? 'resource')}\n`);
      }
      if (args.some((value) => value.endsWith('/install-opl-linux.sh'))) {
        bootstrapCalls += 1;
        return result(0);
      }
      if (args.includes('/opt/opl/bootstrap/opl-install.sh')) return result(0);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      framework_ref: 'a'.repeat(40),
    });
    expect(bootstrapCalls).toBe(1);
  });

  it('does not repair a same-name distribution registered outside App-owned data', async () => {
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: 'C:\\Foreign\\OPL-Linux',
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        return result(1, '', 'identity missing');
      }
      if (args.includes('/etc/opl/identity.json')) return result(1);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).rejects.toMatchObject({
      code: 'same_name_foreign_distribution',
    });
    expect(
      runCommand.mock.calls.some(([, args]) => args.some((value) => value.endsWith('/install-opl-linux.sh')))
    ).toBe(false);
  });

  it('bounds prior-task rebinding to the acceptance-owned root', () => {
    expect(
      __windowsWslProvisionerTest.isWindowsPathWithin(
        'C:\\Users\\gaofe\\AppData\\Local\\OPL-RC-Acceptance',
        'C:\\Users\\gaofe\\AppData\\Local\\OPL-RC-Acceptance\\30286627648\\wsl\\OPL-Linux'
      )
    ).toBe(true);
    expect(
      __windowsWslProvisionerTest.isWindowsPathWithin(
        'C:\\Users\\gaofe\\AppData\\Local\\OPL-RC-Acceptance',
        'C:\\Users\\gaofe\\AppData\\Local\\Other\\OPL-Linux'
      )
    ).toBe(false);
  });

  it('does not rebind a foreign path even when the guest identity is current', async () => {
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: 'C:\\Foreign\\OPL-Linux',
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).rejects.toMatchObject({
      code: 'same_name_foreign_distribution',
    });
  });

  it('rebinds a prior task-owned path when the existing guest proves the OPL identity contract', async () => {
    let inspectCalls = 0;
    let bootstrapCalls = 0;
    const runCommand = vi.fn(async (command: string, args: string[]): Promise<WindowsWslCommandResult> => {
      if (command === 'powershell.exe') {
        return result(
          0,
          JSON.stringify({
            distribution_name: 'OPL-Linux',
            base_path: path.join(path.dirname(path.dirname(userDataPath)), '30286627648', 'wsl', 'OPL-Linux'),
          })
        );
      }
      if (args.join(' ') === '--status') return result(0);
      if (args.join(' ') === '--list --verbose') {
        return result(0, 'NAME          STATE           VERSION\r\nOPL-Linux     Stopped         2\r\n');
      }
      if (args.includes('/opt/opl/bootstrap/opl-runtime-inspect')) {
        inspectCalls += 1;
        return result(
          0,
          JSON.stringify({
            ...identity(),
            bootstrap_digest: inspectCalls <= 2 ? `sha256:${'9'.repeat(64)}` : packagedBootstrapDigest,
          })
        );
      }
      if (args.includes('wslpath')) {
        return result(0, `/mnt/d/opl/${path.basename(args.at(-1) ?? 'resource')}\n`);
      }
      if (args.some((value) => value.endsWith('/install-opl-linux.sh'))) {
        bootstrapCalls += 1;
        return result(0);
      }
      if (args.includes('/opt/opl/bootstrap/opl-install.sh')) return result(0);
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    });
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).resolves.toMatchObject({
      bootstrap_digest: packagedBootstrapDigest,
    });
    expect(bootstrapCalls).toBe(1);
  });

  it('reports restart_required only when WSL remains unavailable after enablement', async () => {
    const runCommand = vi.fn(
      async (command: string): Promise<WindowsWslCommandResult> =>
        command === 'powershell.exe' ? result(0) : result(1, '', 'not ready')
    );
    const provisioner = new WindowsWslProvisioner({
      platform: 'win32',
      resourcesPath,
      userDataPath,
      runCommand,
    });

    await expect(provisioner.ensureReady()).rejects.toMatchObject({
      code: 'wsl_restart_required',
      restartRequired: true,
    });
  });
});
