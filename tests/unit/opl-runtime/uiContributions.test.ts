import { describe, expect, it } from 'vitest';
import {
  activeOplChannelAccessQrChallenge,
  hasPackageContributionExecuteAction,
  readOplChannelAccessResult,
  readOplPackageContributionReadResult,
  readOplTransportBindingsProjection,
  readOplUiContributionsProjection,
  resolveOplUiContributionLabel,
} from '@/common/types/opl/uiContributions';

function entry(input: {
  packageId: string;
  contributionId: string;
  slot: string;
  sortOrder: number;
  kind?: string;
  actionBoundary?: string;
}) {
  return {
    contribution_key: `${input.packageId}:${input.contributionId}`,
    contribution_id: input.contributionId,
    package_id: input.packageId,
    slot: input.slot,
    contribution_kind: input.kind ?? 'view',
    trust_tier: 'declarative',
    scope: 'root',
    sort_order: input.sortOrder,
    ...(input.actionBoundary ? { action_boundary: input.actionBoundary } : {}),
    view: {
      view_id: 'activity',
      view_type: 'activity_log',
      title_i18n: { 'zh-CN': '活动', 'en-US': 'Activity' },
      data_ref: 'example.activity.v1#current',
    },
    commands: [
      {
        command_id: 'refresh',
        label_i18n: { 'zh-CN': '刷新', 'en-US': 'Refresh' },
        action_ref: 'example.activity.v1#refresh',
        confirmation_required: false,
      },
    ],
    badges: [
      {
        badge_id: 'health',
        label_i18n: { 'zh-CN': '正常', 'en-US': 'Healthy' },
        data_ref: 'example.activity.v1#health',
        tone: 'success',
      },
    ],
  };
}

describe('OPL UI contribution projection', () => {
  it('accepts the exact projection, keeps all three slots, and applies stable ordering', () => {
    const projection = readOplUiContributionsProjection({
      ui_contributions: {
        surface_kind: 'opl_app_ui_contributions_projection.v1',
        entries: [
          entry({ packageId: 'z-package', contributionId: 'runtime', slot: 'runtime.detail', sortOrder: 20 }),
          entry({
            packageId: 'a-package',
            contributionId: 'settings',
            slot: 'settings.section',
            sortOrder: 10,
            actionBoundary: 'opl.connect.channel-provider-host',
          }),
          entry({ packageId: 'b-package', contributionId: 'composer', slot: 'composer.palette', sortOrder: 10 }),
        ],
      },
    });

    expect(projection.surfaceKind).toBe('opl_app_ui_contributions_projection.v1');
    expect(projection.entries.map((item) => item.slot)).toEqual([
      'settings.section',
      'composer.palette',
      'runtime.detail',
    ]);
    expect(projection.entries[0]?.commands[0]?.actionRef).toBe('example.activity.v1#refresh');
    expect(projection.entries[0]?.badges[0]?.badgeId).toBe('health');
    expect(projection.entries[0]?.actionBoundary).toBe('opl.connect.channel-provider-host');
  });

  it('drops one malformed entry without disabling valid or unknown-kind entries', () => {
    const malformed = entry({ packageId: 'broken', contributionId: 'wrong-key', slot: 'runtime.detail', sortOrder: 0 });
    malformed.contribution_key = 'different:key';
    const projection = readOplUiContributionsProjection({
      ui_contributions: {
        surface_kind: 'opl_app_ui_contributions_projection.v1',
        entries: [
          malformed,
          entry({ packageId: 'valid', contributionId: 'known', slot: 'runtime.detail', sortOrder: 1 }),
          entry({
            packageId: 'future',
            contributionId: 'future-kind',
            slot: 'runtime.detail',
            sortOrder: 2,
            kind: 'future_kind',
          }),
        ],
      },
    });

    expect(projection.entries.map((item) => item.contributionKey)).toEqual(['valid:known', 'future:future-kind']);
    expect(projection.entries[1]?.contributionKind).toBe('future_kind');
  });

  it('fails closed for other surface kinds and reads action availability from the exact catalog entry', () => {
    expect(readOplUiContributionsProjection({ ui_contributions: { surface_kind: 'other.v1' } }).entries).toEqual([]);
    expect(hasPackageContributionExecuteAction({ actions: [{ action_id: 'other' }] })).toBe(false);
    expect(hasPackageContributionExecuteAction({ actions: [{ action_id: 'package_contribution_execute' }] })).toBe(
      true
    );
  });

  it('resolves localized labels with deterministic fallback', () => {
    const label = { 'zh-CN': '活动', 'en-US': 'Activity' };
    expect(resolveOplUiContributionLabel(label, 'zh-CN', 'fallback')).toBe('活动');
    expect(resolveOplUiContributionLabel(label, 'fr-FR', 'fallback')).toBe('Activity');
    expect(resolveOplUiContributionLabel({}, 'en-US', 'fallback')).toBe('fallback');
  });

  it('parses the canonical transport binding projection and rejects ambiguous targets', () => {
    const binding = {
      binding_id: 'binding-1',
      provider_id: 'opl-weixin',
      account_id: 'account-1',
      channel_session_id: 'transport-1',
      canonical_thread_host: 'codex-app-server',
      canonical_thread_id: 'thread-1',
      project_affinity: 'projectless',
      status: 'bound',
    };
    const projection = readOplTransportBindingsProjection({
      transport_bindings: {
        surface_kind: 'opl_app_transport_bindings_projection.v1',
        status: 'available',
        bindings: [binding],
        authority_boundary: { projection_owner: 'one-person-lab-framework' },
      },
    });
    expect(projection).toMatchObject({
      status: 'available',
      bindings: [
        {
          providerId: 'opl-weixin',
          accountId: 'account-1',
          channelSessionId: 'transport-1',
          canonicalThreadHost: 'codex-app-server',
          canonicalThreadId: 'thread-1',
        },
      ],
    });

    expect(
      readOplTransportBindingsProjection({
        transport_bindings: {
          surface_kind: 'opl_app_transport_bindings_projection.v1',
          status: 'available',
          bindings: [binding, { ...binding, binding_id: 'binding-2', canonical_thread_id: 'thread-2' }],
          authority_boundary: {},
        },
      }).status
    ).toBe('unavailable');

    expect(
      readOplTransportBindingsProjection({
        transport_bindings: {
          surface_kind: 'opl_app_transport_bindings_projection.v1',
          status: 'available',
          bindings: [{ ...binding, provider_id: ' opl-weixin' }],
          authority_boundary: {},
        },
      }).status
    ).toBe('unavailable');
  });

  it('validates channel_access result actions and their exact scoped input', () => {
    const value = {
      schema_version: 'opl-app-channel-access.v1',
      status: 'available',
      channel_id: 'weixin',
      connection: { state: 'connected', account_display_name: 'OPL' },
      actions: [{ command_id: 'channel.disconnect', input: { channel_id: 'weixin' } }],
      pending_pairings: [
        {
          pairing_id: 'pairing-1',
          requested_at_ms: 1,
          expires_at_ms: 2,
          actions: [
            {
              command_id: 'channel.pairing.approve',
              input: { channel_id: 'weixin', pairing_id: 'pairing-1' },
            },
          ],
        },
      ],
      authorized_users: [
        {
          user_id: 'user-1',
          authorized_at_ms: 3,
          actions: [
            {
              command_id: 'channel.user.revoke',
              input: { channel_id: 'weixin', user_id: 'user-1' },
            },
          ],
        },
      ],
      refresh_after_ms: 1000,
    };
    expect(readOplChannelAccessResult(value)).toMatchObject({
      status: 'available',
      channelId: 'weixin',
      pendingPairings: [{ actions: [{ input: { channel_id: 'weixin', pairing_id: 'pairing-1' } }] }],
    });
    expect(
      readOplChannelAccessResult({
        ...value,
        actions: [{ command_id: 'channel.disconnect', input: { channel_id: 'other' } }],
      })
    ).toBeNull();
    expect(
      readOplChannelAccessResult({
        ...value,
        actions: [{ command_id: 'channel.disconnect', input: { channel_id: 'weixin', user_id: 'user-1' } }],
      })
    ).toBeNull();
    expect(
      readOplChannelAccessResult({
        ...value,
        pending_pairings: [
          {
            ...value.pending_pairings[0],
            actions: [
              {
                command_id: 'channel.pairing.approve',
                input: { channel_id: 'weixin', pairing_id: 'different-pairing' },
              },
            ],
          },
        ],
      })
    ).toBeNull();
  });

  it('exposes a QR challenge only while qr_ready and before its expiry', () => {
    const challenge = { payload: 'ephemeral', expiresAtMs: 2_000 };

    expect(activeOplChannelAccessQrChallenge({ state: 'qr_ready', qrChallenge: challenge }, 1_999)).toBe(challenge);
    expect(activeOplChannelAccessQrChallenge({ state: 'connected', qrChallenge: challenge }, 1_999)).toBeNull();
    expect(activeOplChannelAccessQrChallenge({ state: 'qr_ready', qrChallenge: challenge }, 2_000)).toBeNull();
    expect(activeOplChannelAccessQrChallenge({ state: 'qr_ready', qrChallenge: challenge }, 2_001)).toBeNull();
  });

  it('extracts contribution reads only from the exact validated envelope identity', () => {
    const result = {
      surface: 'package_contribution_read',
      ok: true,
      parsed: {
        opl_app_contribution: {
          surface_kind: 'opl_app_package_contribution.v1',
          package_id: 'opl-weixin',
          ref: 'channel.access.v1#current',
          operation: 'read',
          confirmation_required: false,
          carrier_readback: {
            kind: 'local',
            identity: 'opl-weixin@local',
            lifecycle_authority: 'carrier_owned',
          },
          readiness: {
            installed: true,
            physical_status: 'available',
            callability: 'callable',
          },
          response: {
            schema_version: 'opl-package-app-contribution-response.v1',
            ok: true,
            ref: 'channel.access.v1#current',
            operation: 'read',
            result: { status: 'available' },
          },
        },
      },
    };
    expect(
      readOplPackageContributionReadResult(result, {
        packageId: 'opl-weixin',
        ref: 'channel.access.v1#current',
      })
    ).toEqual({ status: 'available' });
    expect(
      readOplPackageContributionReadResult(result, {
        packageId: 'other',
        ref: 'channel.access.v1#current',
      })
    ).toBeNull();

    for (const invalidContribution of [
      { ...result.parsed.opl_app_contribution, confirmation_required: undefined },
      { ...result.parsed.opl_app_contribution, carrier_readback: undefined },
      { ...result.parsed.opl_app_contribution, readiness: undefined },
      {
        ...result.parsed.opl_app_contribution,
        readiness: { installed: true, physical_status: 'available', callability: 'unavailable' },
      },
    ]) {
      expect(
        readOplPackageContributionReadResult(
          { ...result, parsed: { opl_app_contribution: invalidContribution } },
          { packageId: 'opl-weixin', ref: 'channel.access.v1#current' }
        )
      ).toBeNull();
    }
  });
});
