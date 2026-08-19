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
});

describe('remoteCompanionConnectorHost', () => {
  it('loads the selected Framework entrypoint with one canonical callback and a package-scoped blob host', async () => {
    const handle = hostFixture();
    let received: Parameters<RemoteCompanionConnectorHostBootstrap>[0] | undefined;
    const bootstrap = vi.fn(async (options: Parameters<RemoteCompanionConnectorHostBootstrap>[0]) => {
      received = options;
      return handle;
    });

    await expect(
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: '/selected/opl-framework',
        userDataPath: '/tmp/opl-remote-companion-host-test',
        adapter: {} as CanonicalConversationPort,
        readBrokerConfig: () => ({ baseUrl: 'https://link.example.test' }),
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

    const context = await received!.activationContext({
      manifest: {
        package_id: 'opl-link-desktop-connector',
        content_digest: digest('a'),
      },
    });
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
      protocol_version: 'opl_remote_transport.v1',
      service_origin: 'https://link.example.test',
      package_content_digest: digest('a'),
      package_artifact_digest: digest('a'),
    });
    expect(context.config_digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('does not bootstrap a Host when the broker origin is not configured', async () => {
    const loadBootstrap = vi.fn();

    await expect(
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: '/selected/opl-framework',
        readBrokerConfig: () => ({ baseUrl: null }),
        loadBootstrap: async () => {
          throw new Error('Framework bootstrap must not be loaded without a broker origin.');
        },
      })
    ).resolves.toBeNull();
    expect(loadBootstrap).not.toHaveBeenCalled();
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
