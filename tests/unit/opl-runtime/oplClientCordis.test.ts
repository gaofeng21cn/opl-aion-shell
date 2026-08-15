import generatedProductProfile from '@/common/config/oplProductProfile/oplProductProfile.generated.json';
import { createOplClientCordisComposition, readOplClientCompositionPolicy } from '@/renderer/services/oplClientCordis';
import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';

type MutableProductProfile = {
  client_renderer_compatibility: Record<string, unknown>;
  delivery_topology: {
    minimum_complete_product: {
      composition_model: Record<string, unknown>;
    };
  };
};

function mutableProductProfile(): MutableProductProfile {
  return structuredClone(generatedProductProfile) as unknown as MutableProductProfile;
}

function contribution(slot = 'runtime.detail') {
  return {
    contribution_key: 'example.package:activity',
    contribution_id: 'activity',
    package_id: 'example.package',
    slot,
    contribution_kind: 'view',
    trust_tier: 'declarative',
    scope: 'root',
    sort_order: 10,
    view: {
      view_id: 'activity',
      view_type: 'activity_log',
      title_i18n: { 'en-US': 'Package activity' },
      data_ref: 'example.activity.v1#current',
    },
    commands: [],
    badges: [],
  };
}

describe('OPL Client Cordis', () => {
  it('derives the Host-projected Client renderer policy from the synced App product profile', () => {
    expect(readOplClientCompositionPolicy()).toEqual({
      abi: 'opl_app_client_contributions.v1',
      projectionSchema: 'opl_app_ui_contributions_projection.v1',
      slots: ['settings.section', 'runtime.detail', 'composer.palette'],
      stateRpc: 'opl app state --profile fast --json',
      actionRpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
      event: 'opl/app-client-contributions/updated',
      stateSemanticsContract: 'contracts/app-runtime-bridge.json',
      brandCapabilityProjectionPolicy:
        'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
    });
  });

  it('projects Host entries through one Cordis service and typed update event', async () => {
    const composition = await createOplClientCordisComposition();
    const updates: string[][] = [];
    const unsubscribe = composition.contributions.subscribe((projection) => {
      updates.push(projection.entries.map((entry) => entry.contributionKey));
    });

    expect(Context.is(composition.ctx)).toBe(true);
    expect(composition.ctx.registry.size).toBe(1);
    expect((composition.ctx as unknown as Record<string, unknown>)['opl.connect.release-operation']).toBeUndefined();

    const state = {
      ui_contributions: {
        surface_kind: 'opl_app_ui_contributions_projection.v1',
        entries: [contribution()],
      },
    };
    composition.contributions.updateHostProjection(state);
    composition.contributions.updateHostProjection(state);

    expect(composition.contributions.readSlot('runtime.detail').map((entry) => entry.contributionKey)).toEqual([
      'example.package:activity',
    ]);
    expect(updates).toEqual([['example.package:activity']]);

    unsubscribe();
    await composition.dispose();
  });

  it('rejects a product profile that grants the Client independent authority', () => {
    const profile = mutableProductProfile();
    profile.delivery_topology.minimum_complete_product.composition_model.second_package_registry_allowed = true;
    expect(() => readOplClientCompositionPolicy(profile)).toThrow(
      'Invalid OPL Client Cordis policy in the App product profile'
    );
  });

  it('rejects renderer-local compatibility, RPC, event, hot-switch, or brand registry drift', () => {
    const mutations: Array<(profile: MutableProductProfile) => void> = [
      (profile) => {
        profile.client_renderer_compatibility.host_graph_source = 'renderer.graph';
      },
      (profile) => {
        profile.client_renderer_compatibility.allowlist_contract = 'renderer.allowlist';
      },
      (profile) => {
        profile.client_renderer_compatibility.typed_state_rpc = 'renderer state';
      },
      (profile) => {
        profile.client_renderer_compatibility.typed_action_rpc = 'renderer action';
      },
      (profile) => {
        profile.client_renderer_compatibility.typed_client_event = 'renderer/event';
      },
      (profile) => {
        profile.client_renderer_compatibility.hot_switch_without_revalidation_allowed = true;
      },
      (profile) => {
        profile.client_renderer_compatibility.app_fixed_brand_registry_allowed = true;
      },
      (profile) => {
        profile.client_renderer_compatibility.client_fixed_brand_registry_allowed = true;
      },
    ];

    for (const mutate of mutations) {
      const profile = mutableProductProfile();
      mutate(profile);
      expect(() => readOplClientCompositionPolicy(profile)).toThrow(
        'Invalid OPL Client Cordis policy in the App product profile'
      );
    }
  });
});
