import { describe, expect, it } from 'vitest';
import { __wsl2ValidationRuntimeTest, resolveWsl2ValidationRuntime } from '@/process/backend/wsl2ValidationRuntime';

describe('WSL2 validation runtime command adapter', () => {
  it('stays absent unless Windows and the exact developer opt-in flag are both present', () => {
    expect(resolveWsl2ValidationRuntime({ platform: 'darwin', env: { OPL_WINDOWS_WSL2_VALIDATION: '1' } })).toBeNull();
    expect(resolveWsl2ValidationRuntime({ platform: 'win32', env: {} })).toBeNull();
    expect(
      resolveWsl2ValidationRuntime({ platform: 'win32', env: { OPL_WINDOWS_WSL2_VALIDATION: 'true' } })
    ).toBeNull();
  });

  it('uses the disposable fixture and fixed inspection helper through direct wsl --exec arguments', () => {
    const runtime = resolveWsl2ValidationRuntime({
      platform: 'win32',
      env: { OPL_WINDOWS_WSL2_VALIDATION: '1' },
    });

    expect(runtime).not.toBeNull();
    expect(runtime?.distribution).toBe(__wsl2ValidationRuntimeTest.DEFAULT_DISTRIBUTION);
    expect(runtime?.inspect()).toEqual({
      command: 'wsl.exe',
      args: ['--distribution', 'OPL-Validation-g0001', '--exec', '/opt/opl/bootstrap/opl-runtime-inspect', '--json'],
      redactedCommand: 'wsl.exe --distribution <validation-fixture> --exec opl-runtime-inspect --json',
    });
  });

  it('builds fixed launch and cleanup operations without a Windows executor or shell interpolation', () => {
    const runtime = resolveWsl2ValidationRuntime({
      platform: 'win32',
      env: { OPL_WINDOWS_WSL2_VALIDATION: '1' },
    });
    expect(runtime).not.toBeNull();

    expect(runtime?.launch('codex-app-server', 'v3-codex-001')).toEqual({
      command: 'wsl.exe',
      args: [
        '--distribution',
        'OPL-Validation-g0001',
        '--exec',
        '/opt/opl/bootstrap/opl-runtime-exec',
        '--kind',
        'codex-app-server',
        '--operation-token',
        'v3-codex-001',
      ],
      redactedCommand:
        'wsl.exe --distribution <validation-fixture> --exec opl-runtime-exec --kind codex-app-server --operation-token <redacted>',
    });
    expect(runtime?.stop('v3-codex-001')).toEqual({
      command: 'wsl.exe',
      args: [
        '--distribution',
        'OPL-Validation-g0001',
        '--exec',
        '/opt/opl/bootstrap/opl-runtime-control',
        '--operation-token',
        'v3-codex-001',
      ],
      redactedCommand:
        'wsl.exe --distribution <validation-fixture> --exec opl-runtime-control --operation-token <redacted>',
    });
  });

  it('accepts an explicitly named disposable fixture but rejects arbitrary distributions and unsafe operation tokens', () => {
    const runtime = resolveWsl2ValidationRuntime({
      platform: 'win32',
      env: {
        OPL_WINDOWS_WSL2_VALIDATION: '1',
        OPL_WINDOWS_WSL2_VALIDATION_DISTRIBUTION: 'OPL-Validation-g0002',
      },
    });
    expect(runtime?.distribution).toBe('OPL-Validation-g0002');
    expect(() => runtime?.launch('aioncore', 'bad;token')).toThrow(/operation token/i);
    expect(() => runtime?.launch('unrestricted-command' as 'aioncore', 'v2-run-001')).toThrow(/runtime kind/i);
    expect(() =>
      resolveWsl2ValidationRuntime({
        platform: 'win32',
        env: {
          OPL_WINDOWS_WSL2_VALIDATION: '1',
          OPL_WINDOWS_WSL2_VALIDATION_DISTRIBUTION: 'Ubuntu',
        },
      })
    ).toThrow(/distribution/i);
  });
});
