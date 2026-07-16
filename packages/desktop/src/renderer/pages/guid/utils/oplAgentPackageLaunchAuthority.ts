import { canonicalWorkspacePath } from '@/renderer/utils/workspace/workspacePath';

type JsonRecord = Record<string, unknown>;

type MinimalPackageUseBinding = {
  surface_kind: 'opl_agent_package_use_binding.v1';
  root_package: {
    package_id: string;
    package_version?: string;
  };
  scope?: string;
  target_root?: string;
};

export type OplAgentPackageActivationReceipt = {
  action_id: 'agent_package_activate';
  package_id: string;
  package_version?: string;
  scope?: string;
  target_workspace?: string;
  use_boundary_id?: string;
  launch_allowed: true;
  use_receipt_ref?: string;
  use_binding?: MinimalPackageUseBinding;
};

export type OplAgentPackageLaunchFailureCode =
  | 'agent_package_unavailable'
  | 'agent_package_launch_blocked'
  | 'agent_package_activation_invalid'
  | 'agent_package_selection_mismatch'
  | 'agent_package_version_mismatch'
  | 'agent_package_entrypoint_missing'
  | 'agent_package_target_mismatch';

export class OplAgentPackageLaunchError extends Error {
  readonly code: OplAgentPackageLaunchFailureCode;
  readonly blockedReason: string | null;

  constructor(code: OplAgentPackageLaunchFailureCode, blockedReason: string | null = null) {
    super(blockedReason ? `${code}: ${blockedReason}` : code);
    this.name = 'OplAgentPackageLaunchError';
    this.code = code;
    this.blockedReason = blockedReason;
  }
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function nonemptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function bindingValue(activation: JsonRecord): JsonRecord | null {
  const candidate = activation.use_binding ?? activation.package_use_binding;
  if (candidate === undefined || candidate === null) return null;
  const binding = recordValue(candidate);
  if (!binding) throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  return binding;
}

function canonicalTarget(value: unknown): string | null {
  const target = nonemptyString(value);
  return target ? canonicalWorkspacePath(target) : null;
}

function targetMatches(value: unknown, expectedTarget: string): boolean {
  return canonicalTarget(value) === expectedTarget;
}

function optionalRecord(value: unknown): JsonRecord | null {
  if (value === undefined || value === null) return null;
  const record = recordValue(value);
  if (!record) throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  return record;
}

function optionalRecordList(value: unknown): JsonRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  const records = value.map(recordValue);
  if (records.some((entry) => !entry)) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }
  return records as JsonRecord[];
}

/**
 * Validate only the package selection, installed version, and managed workspace
 * target needed before creating a conversation. Additional Framework metadata
 * is outside this Shell launch check.
 */
export function parseOplAgentPackageLaunchResult(input: {
  parsed: unknown;
  packageId: string;
  packageVersion: string | null;
  targetWorkspace: string | null;
  scope: string | null;
}): OplAgentPackageActivationReceipt {
  const parsed = recordValue(input.parsed);
  const execution = recordValue(parsed?.app_action_execution);
  const result = recordValue(execution?.result);
  const activation = recordValue(result?.opl_agent_package_activation);
  if (!execution || execution.action_id !== 'agent_package_activate' || !activation) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  const launchState = nonemptyString(activation.launch_state);
  const launchStateReason = nonemptyString(activation.launch_state_reason);
  if (
    (launchState && !['ready', 'degraded', 'package_unavailable'].includes(launchState)) ||
    (launchState === 'ready' && (activation.launch_allowed !== true || launchStateReason)) ||
    (launchState === 'degraded' && (activation.launch_allowed !== true || !launchStateReason)) ||
    (launchState === 'package_unavailable' && (activation.launch_allowed !== false || !launchStateReason))
  ) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  if (activation.launch_allowed !== true) {
    const blockedReason = launchStateReason ?? nonemptyString(activation.launch_blocked_reason);
    if (!blockedReason) {
      throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
    }
    if (blockedReason.includes('entrypoint')) {
      throw new OplAgentPackageLaunchError('agent_package_entrypoint_missing', blockedReason);
    }
    throw new OplAgentPackageLaunchError('agent_package_unavailable', blockedReason);
  }

  if (activation.package_id !== input.packageId) {
    throw new OplAgentPackageLaunchError('agent_package_selection_mismatch');
  }
  if (activation.status === 'blocked' || activation.status === 'failed' || activation.status === 'unavailable') {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  const packageLock = optionalRecord(activation.package_lock);
  const binding = bindingValue(activation);
  const rootPackage = binding ? optionalRecord(binding.root_package) : null;
  if (binding && (binding.surface_kind !== 'opl_agent_package_use_binding.v1' || !rootPackage)) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  if (
    (packageLock && packageLock.package_id !== input.packageId) ||
    (rootPackage && rootPackage.package_id !== input.packageId)
  ) {
    throw new OplAgentPackageLaunchError('agent_package_selection_mismatch');
  }

  const versions = [
    nonemptyString(activation.package_version),
    nonemptyString(packageLock?.package_version),
    nonemptyString(rootPackage?.package_version),
  ].filter((version): version is string => Boolean(version));
  if (
    new Set(versions).size > 1 ||
    (input.packageVersion && versions.some((version) => version !== input.packageVersion))
  ) {
    throw new OplAgentPackageLaunchError('agent_package_version_mismatch');
  }

  const targetWorkspace = input.targetWorkspace ? canonicalTarget(input.targetWorkspace) : null;
  if (input.targetWorkspace && !targetWorkspace) {
    throw new OplAgentPackageLaunchError('agent_package_target_mismatch');
  }
  const readiness = optionalRecord(activation.materialization_readiness);
  const scopeMaterializations = optionalRecordList(activation.scope_materializations);
  const targetValues = [
    activation.target_workspace,
    binding?.target_root,
    readiness?.target_root,
    ...scopeMaterializations.map((materialization) => materialization.target_root),
  ].filter((value) => value !== undefined && value !== null);
  if (
    targetWorkspace &&
    (targetValues.length === 0 || targetValues.some((value) => !targetMatches(value, targetWorkspace)))
  ) {
    throw new OplAgentPackageLaunchError('agent_package_target_mismatch');
  }
  const scopeValues = [
    activation.scope,
    binding?.scope,
    readiness?.scope,
    ...scopeMaterializations.map((materialization) => materialization.scope),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (input.scope && scopeValues.some((scope) => scope !== input.scope)) {
    throw new OplAgentPackageLaunchError('agent_package_target_mismatch');
  }

  const useBoundaryId = nonemptyString(activation.use_boundary_id) ?? nonemptyString(binding?.use_boundary_id);
  const useReceiptRef = nonemptyString(activation.use_receipt_ref) ?? nonemptyString(binding?.use_receipt_ref);
  const packageVersion = versions[0];
  const returnedScope = input.scope ?? scopeValues[0] ?? null;
  const bindingVersion = nonemptyString(rootPackage?.package_version);
  const bindingScope = nonemptyString(binding?.scope);
  const bindingTarget = canonicalTarget(binding?.target_root);

  return {
    action_id: 'agent_package_activate',
    package_id: input.packageId,
    ...(packageVersion ? { package_version: packageVersion } : {}),
    ...(returnedScope ? { scope: returnedScope } : {}),
    ...(targetWorkspace ? { target_workspace: targetWorkspace } : {}),
    ...(useBoundaryId ? { use_boundary_id: useBoundaryId } : {}),
    launch_allowed: true,
    ...(useReceiptRef ? { use_receipt_ref: useReceiptRef } : {}),
    ...(binding && rootPackage
      ? {
          use_binding: {
            surface_kind: 'opl_agent_package_use_binding.v1' as const,
            root_package: {
              package_id: input.packageId,
              ...(bindingVersion ? { package_version: bindingVersion } : {}),
            },
            ...(bindingScope ? { scope: bindingScope } : {}),
            ...(bindingTarget ? { target_root: bindingTarget } : {}),
          },
        }
      : {}),
  };
}
