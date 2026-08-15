/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import generatedProductProfile from '@/common/config/oplProductProfile/oplProductProfile.generated.json';
import {
  OPL_UI_CONTRIBUTION_SLOTS,
  readOplUiContributionsProjection,
  type OplUiContribution,
  type OplUiContributionsProjection,
  type OplUiContributionSlot,
} from '@/common/types/opl/uiContributions';
import { Context } from '@deepseek-ai/cordis';

export const OPL_CLIENT_CONTRIBUTIONS_SERVICE = 'opl.app.client-contributions';
export const OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT = 'opl/app-client-contributions/updated';

type OplClientCompositionPolicy = {
  abi: 'opl_app_client_contributions.v1';
  projectionSchema: 'opl_app_ui_contributions_projection.v1';
  slots: readonly OplUiContributionSlot[];
  stateRpc: 'opl app state --profile fast --json';
  actionRpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json';
  event: 'opl/app-client-contributions/updated';
  stateSemanticsContract: 'contracts/app-runtime-bridge.json';
  brandCapabilityProjectionPolicy: 'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client';
};

type OplClientContributionsService = {
  readonly policy: OplClientCompositionPolicy;
  updateHostProjection(state: unknown): OplUiContributionsProjection;
  readSlot(slot: OplUiContributionSlot): readonly OplUiContribution[];
  subscribe(listener: (projection: OplUiContributionsProjection) => void): () => void;
};

declare module '@deepseek-ai/cordis' {
  interface Context {
    [OPL_CLIENT_CONTRIBUTIONS_SERVICE]: OplClientContributionsService;
  }

  interface Events {
    [OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT](projection: OplUiContributionsProjection): void;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sameSlots(value: unknown): value is OplUiContributionSlot[] {
  return (
    Array.isArray(value) &&
    value.length === OPL_UI_CONTRIBUTION_SLOTS.length &&
    OPL_UI_CONTRIBUTION_SLOTS.every((slot) => value.includes(slot))
  );
}

export function readOplClientCompositionPolicy(profile: unknown = generatedProductProfile): OplClientCompositionPolicy {
  const root = asRecord(profile);
  const deliveryTopology = asRecord(root?.delivery_topology);
  const minimumProduct = asRecord(deliveryTopology?.minimum_complete_product);
  const composition = asRecord(minimumProduct?.composition_model);
  const compatibility = asRecord(root?.client_renderer_compatibility);
  const slots = composition?.package_contribution_slots;
  const compatibilitySlots = compatibility?.typed_slots;
  if (
    composition?.app_client_contribution_abi !== 'opl_app_client_contributions.v1' ||
    composition?.framework_host_graph_source !== 'app_state.ui_contributions' ||
    composition?.framework_host_projection_schema !== 'opl_app_ui_contributions_projection.v1' ||
    composition?.host_projection_graph_policy !== 'allowlisted_closed_graph_from_framework_projection_only' ||
    composition?.typed_slot_policy !== 'mount_only_app_product_profile_declared_slots' ||
    composition?.typed_action_policy !== 'action_refs_only_via_canonical_app_action_bridge' ||
    composition?.framework_host_composition_authority !== 'one-person-lab-framework' ||
    composition?.framework_projection_runtime_status !== 'framework_host_projection_active' ||
    composition?.client_authority_policy !==
      'render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth' ||
    composition?.client_renderer_compatibility_profile !== 'client_renderer_compatibility' ||
    composition?.client_renderer_switch_policy !==
      'explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch' ||
    composition?.brand_capability_projection_policy !==
      'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client' ||
    composition?.independent_host_truth_allowed !== false ||
    composition?.second_client_composition_graph_allowed !== false ||
    composition?.second_package_registry_allowed !== false ||
    composition?.second_currentness_authority_allowed !== false ||
    composition?.second_state_or_action_truth_allowed !== false ||
    compatibility?.schema !== 'opl_app_client_renderer_compatibility.v1' ||
    compatibility?.owner !== 'one-person-lab-app' ||
    compatibility?.host_composition_authority !== 'one-person-lab-framework' ||
    compatibility?.host_graph_source !== composition.framework_host_graph_source ||
    compatibility?.host_projection_schema !== composition.framework_host_projection_schema ||
    compatibility?.contribution_abi !== composition.app_client_contribution_abi ||
    compatibility?.allowlist_contract !== composition.host_projection_allowlist_contract ||
    compatibility?.typed_state_rpc !== 'opl app state --profile fast --json' ||
    compatibility?.typed_action_rpc !==
      'opl app action execute --action <action_id> [--payload json] [--dry-run] --json' ||
    compatibility?.typed_client_event !== OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT ||
    compatibility?.state_semantics_contract !== 'contracts/app-runtime-bridge.json' ||
    compatibility?.client_authority_policy !== composition.client_authority_policy ||
    compatibility?.switch_policy !== composition.client_renderer_switch_policy ||
    compatibility?.hot_switch_without_revalidation_allowed !== false ||
    compatibility?.brand_capability_projection_policy !== composition.brand_capability_projection_policy ||
    compatibility?.app_fixed_brand_registry_allowed !== false ||
    compatibility?.client_fixed_brand_registry_allowed !== false ||
    compatibility?.display_and_allowlist_owner !== 'one-person-lab-app' ||
    !sameSlots(slots) ||
    !sameSlots(compatibilitySlots)
  ) {
    throw new Error('Invalid OPL Client Cordis policy in the App product profile');
  }

  return Object.freeze({
    abi: 'opl_app_client_contributions.v1',
    projectionSchema: 'opl_app_ui_contributions_projection.v1',
    slots: Object.freeze([...slots]),
    stateRpc: 'opl app state --profile fast --json',
    actionRpc: 'opl app action execute --action <action_id> [--payload json] [--dry-run] --json',
    event: OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT,
    stateSemanticsContract: 'contracts/app-runtime-bridge.json',
    brandCapabilityProjectionPolicy:
      'dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client',
  });
}

function createClientContributionsService(
  ctx: Context,
  policy: OplClientCompositionPolicy
): OplClientContributionsService {
  let projection = readOplUiContributionsProjection(null);
  let fingerprint = JSON.stringify(projection);

  return Object.freeze({
    policy,
    updateHostProjection(state: unknown) {
      const parsed = readOplUiContributionsProjection(state);
      const next = {
        ...parsed,
        entries: parsed.entries.filter((entry) => policy.slots.includes(entry.slot)),
      } satisfies OplUiContributionsProjection;
      const nextFingerprint = JSON.stringify(next);
      if (nextFingerprint === fingerprint) return projection;
      projection = next;
      fingerprint = nextFingerprint;
      ctx.emit(OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT, projection);
      return projection;
    },
    readSlot(slot: OplUiContributionSlot) {
      if (!policy.slots.includes(slot)) return [];
      return projection.entries.filter((entry) => entry.slot === slot);
    },
    subscribe(listener: (next: OplUiContributionsProjection) => void) {
      return ctx.on(OPL_CLIENT_CONTRIBUTIONS_UPDATED_EVENT, listener);
    },
  });
}

const oplClientContributionsPlugin = {
  name: 'opl-app-client-contributions',
  provide: OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  apply(ctx: Context, config: { profile?: unknown } = {}) {
    const policy = readOplClientCompositionPolicy(config.profile);
    ctx.provide(OPL_CLIENT_CONTRIBUTIONS_SERVICE, createClientContributionsService(ctx, policy));
  },
};

export async function createOplClientCordisComposition(profile: unknown = generatedProductProfile) {
  const ctx = new Context();
  const fiber = await ctx.plugin(oplClientContributionsPlugin, { profile });
  return {
    ctx,
    fiber,
    contributions: ctx[OPL_CLIENT_CONTRIBUTIONS_SERVICE],
    async dispose() {
      await fiber.dispose();
      await ctx.fiber.dispose();
    },
  };
}

let rendererComposition: ReturnType<typeof createOplClientCordisComposition> | null = null;

export function getOplClientCordisComposition() {
  rendererComposition ??= createOplClientCordisComposition();
  return rendererComposition;
}

export async function resetOplClientCordisCompositionForTest(): Promise<void> {
  const current = rendererComposition;
  rendererComposition = null;
  if (current) await (await current).dispose();
}
