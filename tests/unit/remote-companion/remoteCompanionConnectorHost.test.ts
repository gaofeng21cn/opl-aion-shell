import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalConversationPort } from '@/process/services/remote-companion/canonicalConversationBridge';
import {
  disposeRemoteCompanionConnectorHost,
  runActiveRemoteCompanionAccess,
  setActiveRemoteCompanionConnectorHost,
  startRemoteCompanionConnectorHost,
  type RemoteCompanionConnectorHostBootstrap,
  type RemoteCompanionConnectorHostHandle,
} from '@/process/services/remote-companion/remoteCompanionConnectorHost';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const releaseCohort = {
  environment: 'validation',
  cohort_id: 'ably-validation-20260819',
  protocol_version: 'opl_remote_transport.v1',
  provider: 'ably',
  service_origin: 'https://validation.invalid',
  config_summary: {
    active_pair_limit: 20,
    warning_threshold: 15,
    pair_ttl_seconds: 300,
    invitation_default_ttl_seconds: 259200,
    invitation_max_ttl_seconds: 604800,
    manual_code_max_attempts: 5,
    jwt_max_ttl_seconds: 3600,
    idempotency_response_ttl_seconds: 600,
    clock_skew_seconds: 30,
  },
  config_digest: 'sha256:721fce8b69d45bc311857fe774201427add86e038cf36243d80b3efa673a9718',
};
const packageRoots: string[] = [];

function packageFixture(options: Readonly<{ locked?: boolean; cohort?: Record<string, unknown> }> = {}) {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-remote-companion-host-'));
  packageRoots.push(packageRoot);
  if (options.locked !== false) {
    fs.writeFileSync(path.join(packageRoot, 'release-cohort.json'), JSON.stringify(options.cohort ?? releaseCohort));
  }
  return packageRoot;
}

function descriptorFor(packageRoot: string, contentLockPaths: string[] = ['release-cohort.json']) {
  return {
    sourcePath: packageRoot,
    manifest: {
      package_id: 'opl-link-desktop-connector',
      content_lock_paths: contentLockPaths,
      content_digest: digest('a'),
    },
  };
}

function hostFixture(): RemoteCompanionConnectorHostHandle {
  return {
    dispose: vi.fn(async () => undefined),
    appStatePatch: () => ({
      ui_contributions: {
        entries: [
          {
            package_id: 'opl-link-desktop-connector',
            action_boundary: 'opl.connect.remote-companion-connector-host',
            view: {
              view_type: 'remote_companion_access',
              data_ref: 'opl.link.remote_companion#current',
            },
            commands: [{ action_ref: 'pair.start' }],
          },
        ],
      },
    }),
    readRemoteCompanionAccess: vi.fn(async () => ({ read: true })),
    executeRemoteCompanionAction: vi.fn(async () => ({ execute: true })),
  };
}

afterEach(async () => {
  await disposeRemoteCompanionConnectorHost();
  while (packageRoots.length > 0) fs.rmSync(packageRoots.pop()!, { recursive: true, force: true });
});

describe('remoteCompanionConnectorHost', () => {
  it('loads the selected Framework entrypoint with one canonical callback and a package-scoped blob host', async () => {
    const handle = hostFixture();
    const packageRoot = packageFixture();
    const descriptor = descriptorFor(packageRoot);
    let received: Parameters<RemoteCompanionConnectorHostBootstrap>[0] | undefined;
    let activationContext: Awaited<
      ReturnType<NonNullable<Parameters<RemoteCompanionConnectorHostBootstrap>[0]['activationContext']>>
    >;
    const bootstrap = vi.fn(async (options: Parameters<RemoteCompanionConnectorHostBootstrap>[0]) => {
      received = options;
      activationContext = await options.activationContext(descriptor);
      return handle;
    });

    await expect(
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: '/selected/opl-framework',
        userDataPath: '/tmp/opl-remote-companion-host-test',
        adapter: {} as CanonicalConversationPort,
        loadBootstrap: async () => bootstrap,
      })
    ).resolves.toBe(handle);

    expect(bootstrap).toHaveBeenCalledOnce();
    expect(received && Object.keys(received.canonical_conversation_bridge).sort()).toEqual([
      'listDirectory',
      'openConversation',
      'readHistory',
      'refresh',
      'respondApproval',
      'sendMessage',
      'startConversation',
      'stopTurn',
      'subscribeEvents',
    ]);
    expect(received && Object.keys(received.protectedBlobHost.forPackage('opl-link-desktop-connector')).sort()).toEqual(
      ['clear', 'read', 'replace']
    );

    const context = activationContext!;
    expect(Object.keys(context).sort()).toEqual([
      'cohort_id',
      'config_digest',
      'environment',
      'package_artifact_digest',
      'package_content_digest',
      'package_id',
      'protocol_version',
      'provider',
      'service_origin',
      'surface_kind',
    ]);
    expect(context).toMatchObject({
      surface_kind: 'opl_remote_companion_activation_context.v1',
      package_id: 'opl-link-desktop-connector',
      environment: releaseCohort.environment,
      cohort_id: releaseCohort.cohort_id,
      protocol_version: 'opl_remote_transport.v1',
      provider: releaseCohort.provider,
      service_origin: releaseCohort.service_origin,
      config_digest: releaseCohort.config_digest,
      package_content_digest: digest('a'),
      package_artifact_digest: digest('a'),
    });
    expect(context.config_digest).toBe(releaseCohort.config_digest);
  });

  it.each([
    {
      name: 'missing release cohort',
      packageRoot: () => packageFixture({ locked: false }),
      descriptor: (packageRoot: string) => descriptorFor(packageRoot),
      error: /requires release-cohort\.json in the Package content lock|cannot read the Package release cohort/u,
    },
    {
      name: 'release cohort is not locked',
      packageRoot: () => packageFixture(),
      descriptor: (packageRoot: string) => descriptorFor(packageRoot, ['connector.mjs']),
      error: /requires release-cohort\.json in the Package content lock/u,
    },
    {
      name: 'provider is not Ably',
      packageRoot: () => packageFixture({ cohort: { ...releaseCohort, provider: 'tencent_cloud_im' } }),
      descriptor: (packageRoot: string) => descriptorFor(packageRoot),
      error: /requires provider=ably/u,
    },
    {
      name: 'config summary digest is stale',
      packageRoot: () =>
        packageFixture({
          cohort: {
            ...releaseCohort,
            config_summary: { ...releaseCohort.config_summary, active_pair_limit: 21 },
          },
        }),
      descriptor: (packageRoot: string) => descriptorFor(packageRoot),
      error: /config_digest does not match release-cohort\.json/u,
    },
  ])('fails closed when $name', async ({ packageRoot: createPackageRoot, descriptor: makeDescriptor, error }) => {
    const packageRoot = createPackageRoot();
    const bootstrap = vi.fn(async (options: Parameters<RemoteCompanionConnectorHostBootstrap>[0]) => {
      await options.activationContext(makeDescriptor(packageRoot));
      return hostFixture();
    });

    await expect(
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: '/selected/opl-framework',
        userDataPath: packageRoot,
        adapter: {} as CanonicalConversationPort,
        loadBootstrap: async () => bootstrap,
      })
    ).rejects.toThrow(error);
    expect(bootstrap).toHaveBeenCalledOnce();
  });

  it('fails closed when the locked release cohort resolves through a symlink outside the Package', async () => {
    const packageRoot = packageFixture({ locked: false });
    const outsideRoot = packageFixture();
    fs.symlinkSync(path.join(outsideRoot, 'release-cohort.json'), path.join(packageRoot, 'release-cohort.json'));
    const bootstrap = vi.fn(async (options: Parameters<RemoteCompanionConnectorHostBootstrap>[0]) => {
      await options.activationContext(descriptorFor(packageRoot));
      return hostFixture();
    });

    await expect(
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: '/selected/opl-framework',
        userDataPath: packageRoot,
        adapter: {} as CanonicalConversationPort,
        loadBootstrap: async () => bootstrap,
      })
    ).rejects.toThrow(/escapes the Package through a link/u);
  });

  it('routes only current remote_companion_access projection refs and disposes the active Host', async () => {
    const host = hostFixture();
    setActiveRemoteCompanionConnectorHost(Promise.resolve(host));

    await expect(
      runActiveRemoteCompanionAccess(
        {
          package_id: 'opl-link-desktop-connector',
          ref: 'opl.link.remote_companion#current',
        },
        'read'
      )
    ).resolves.toEqual({ read: true });
    await expect(
      runActiveRemoteCompanionAccess(
        {
          package_id: 'opl-link-desktop-connector',
          ref: 'pair.start',
          input: { invitation_code: 'INVITE' },
        },
        'execute'
      )
    ).resolves.toEqual({ execute: true });
    await expect(
      runActiveRemoteCompanionAccess({ package_id: 'other-package', ref: 'pair.start' }, 'execute')
    ).resolves.toBeUndefined();
    await expect(
      runActiveRemoteCompanionAccess({ package_id: 'opl-link-desktop-connector', ref: 'not-declared' }, 'read')
    ).resolves.toBeUndefined();

    await disposeRemoteCompanionConnectorHost();
    expect(host.dispose).toHaveBeenCalledOnce();
  });
});
