import { canonicalWorkspacePath } from '@/renderer/utils/workspace/workspacePath';

type JsonRecord = Record<string, unknown>;

type MinimalPackageUseBinding = {
  surface_kind: 'opl_agent_package_use_binding.v1';
  root_package: {
    package_id: string;
    package_version: string;
  };
  scope: 'workspace';
  target_root: string;
};

export type OplAgentPackageActivationReceipt = {
  action_id: 'agent_package_activate';
  package_id: string;
  package_version: string;
  scope: 'workspace';
  target_workspace: string;
  use_boundary_id?: string;
  launch_allowed: true;
  use_receipt_ref?: string;
  use_binding: MinimalPackageUseBinding;
};

export type OplAgentPackageLaunchFailureCode =
  | 'agent_package_launch_blocked'
  | 'agent_package_activation_invalid'
  | 'agent_package_selection_mismatch'
  | 'agent_package_version_mismatch'
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
  return recordValue(activation.use_binding) ?? recordValue(activation.package_use_binding);
}

function canonicalTarget(value: unknown): string | null {
  const target = nonemptyString(value);
  return target ? canonicalWorkspacePath(target) : null;
}

function targetMatches(value: unknown, expectedTarget: string): boolean {
  return canonicalTarget(value) === expectedTarget;
}

function scopeMaterializationsMatch(value: unknown, expectedTarget: string): boolean {
  if (value === undefined || value === null) return true;
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    const materialization = recordValue(entry);
    return materialization?.scope === 'workspace' && targetMatches(materialization.target_root, expectedTarget);
  });
}

/**
 * Validate only the package selection, installed version, and managed workspace
 * target needed before creating a conversation. Additional Framework metadata
 * is outside this Shell launch check.
 */
export function parseOplAgentPackageLaunchResult(input: {
  parsed: unknown;
  packageId: string;
  targetWorkspace: string;
}): OplAgentPackageActivationReceipt {
  const parsed = recordValue(input.parsed);
  const execution = recordValue(parsed?.app_action_execution);
  const result = recordValue(execution?.result);
  const activation = recordValue(result?.opl_agent_package_activation);
  if (!execution || execution.action_id !== 'agent_package_activate' || !activation) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  if (activation.launch_allowed !== true) {
    const blockedReason = nonemptyString(activation.launch_blocked_reason);
    if (!blockedReason) {
      throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
    }
    throw new OplAgentPackageLaunchError('agent_package_launch_blocked', blockedReason);
  }

  if (
    !['activated', 'already_activated'].includes(String(activation.status)) ||
    activation.operational_ready !== true
  ) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  const packageLock = recordValue(activation.package_lock);
  const binding = bindingValue(activation);
  const rootPackage = recordValue(binding?.root_package);
  if (!packageLock || !binding || !rootPackage) {
    throw new OplAgentPackageLaunchError('agent_package_activation_invalid');
  }

  if (
    activation.package_id !== input.packageId ||
    packageLock.package_id !== input.packageId ||
    rootPackage.package_id !== input.packageId
  ) {
    throw new OplAgentPackageLaunchError('agent_package_selection_mismatch');
  }

  const lockVersion = nonemptyString(packageLock.package_version);
  const activeVersion = nonemptyString(rootPackage.package_version);
  const topLevelVersion = nonemptyString(activation.package_version);
  if (
    !lockVersion ||
    !activeVersion ||
    lockVersion !== activeVersion ||
    (topLevelVersion && topLevelVersion !== lockVersion)
  ) {
    throw new OplAgentPackageLaunchError('agent_package_version_mismatch');
  }

  const targetWorkspace = canonicalTarget(input.targetWorkspace);
  const readiness = recordValue(activation.materialization_readiness);
  const readinessTarget = readiness?.target_root;
  if (
    !targetWorkspace ||
    binding.scope !== 'workspace' ||
    !targetMatches(binding.target_root, targetWorkspace) ||
    (readiness?.scope !== undefined && readiness.scope !== null && readiness.scope !== 'workspace') ||
    (readinessTarget !== undefined && readinessTarget !== null && !targetMatches(readinessTarget, targetWorkspace)) ||
    !scopeMaterializationsMatch(activation.scope_materializations, targetWorkspace)
  ) {
    throw new OplAgentPackageLaunchError('agent_package_target_mismatch');
  }

  const useBoundaryId = nonemptyString(activation.use_boundary_id) ?? nonemptyString(binding.use_boundary_id);
  const useReceiptRef = nonemptyString(activation.use_receipt_ref) ?? nonemptyString(binding.use_receipt_ref);

  return {
    action_id: 'agent_package_activate',
    package_id: input.packageId,
    package_version: lockVersion,
    scope: 'workspace',
    target_workspace: targetWorkspace,
    ...(useBoundaryId ? { use_boundary_id: useBoundaryId } : {}),
    launch_allowed: true,
    ...(useReceiptRef ? { use_receipt_ref: useReceiptRef } : {}),
    use_binding: {
      surface_kind: 'opl_agent_package_use_binding.v1',
      root_package: {
        package_id: input.packageId,
        package_version: lockVersion,
      },
      scope: 'workspace',
      target_root: targetWorkspace,
    },
  };
}
