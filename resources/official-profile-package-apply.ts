#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type OfficialProfileApplyIntent = 'first_install' | 'explicit_restore';

type OplExecution = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

type OfficialProfileApplyRuntime = {
  execute: (args: string[]) => OplExecution;
};

type JsonRecord = Record<string, any>;

const PROJECTED_ACTION_COMMAND = ['app', 'action', 'execute'] as const;

type ProjectedPackageAction = {
  action_id: string;
  action_ref: string;
  payload: JsonRecord;
  required_payload_fields: string[];
  confirmation_required: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonResult(result: OplExecution, args: string[]) {
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ??
        result.stderr.trim() ??
        `opl ${args.join(' ')} exited with status ${String(result.status)}`
    );
  }
  try {
    return JSON.parse(result.stdout) as JsonRecord;
  } catch (error) {
    throw new Error(
      `opl ${args.join(' ')} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function fastAppState(runtime: OfficialProfileApplyRuntime) {
  const args = ['app', 'state', '--profile', 'fast', '--json'];
  return parseJsonResult(runtime.execute(args), args);
}

function appStateRecord(payload: JsonRecord) {
  if (isRecord(payload.app_state)) return payload.app_state;
  if (isRecord(payload.opl_app_state) && isRecord(payload.opl_app_state.app_state)) {
    return payload.opl_app_state.app_state;
  }
  throw new Error('Fast App state readback is missing app_state.');
}

function statusIndexPackage(statusIndex: JsonRecord, packageId: string) {
  if (isRecord(statusIndex.packages)) {
    const status = statusIndex.packages[packageId];
    return isRecord(status) ? status : null;
  }
  if (Array.isArray(statusIndex.packages)) {
    return statusIndex.packages.find((entry: unknown) => isRecord(entry) && entry.package_id === packageId) ?? null;
  }
  return null;
}

const dependencyAbsenceStatuses = new Set([
  'absent',
  'disabled',
  'missing',
  'not_installed',
  'physical_unavailable',
  'unavailable',
]);

function requiredDependencyPresent(dependency: JsonRecord) {
  if (dependency.required === false) return true;
  if (dependency.installed === false || dependency.enabled === false) return false;
  if (typeof dependency.status === 'string' && dependencyAbsenceStatuses.has(dependency.status)) {
    return false;
  }
  if (
    typeof dependency.physical_surface_status === 'string' &&
    dependencyAbsenceStatuses.has(dependency.physical_surface_status)
  ) {
    return false;
  }
  if (dependency.exports_satisfied === false) return false;
  if (Array.isArray(dependency.missing_required_export_ids) && dependency.missing_required_export_ids.length > 0) {
    return false;
  }
  if (Array.isArray(dependency.missing_required_module_ids) && dependency.missing_required_module_ids.length > 0) {
    return false;
  }
  const reasons = Array.isArray(dependency.reasons)
    ? dependency.reasons
    : Array.isArray(dependency.failure_reasons)
      ? dependency.failure_reasons
      : [];
  const absenceReasons = new Set([
    'dependency_disabled',
    'dependency_missing',
    'physical_unavailable',
    'required_exports_missing',
    'required_modules_missing',
  ]);
  return !reasons.some((reason: unknown) => typeof reason === 'string' && absenceReasons.has(reason));
}

function requiredClosurePresent(status: JsonRecord) {
  const packageReadiness = isRecord(status.package_dependency_readiness) ? status.package_dependency_readiness : {};
  if (typeof packageReadiness.status === 'string' && dependencyAbsenceStatuses.has(packageReadiness.status)) {
    return false;
  }
  const dependencyReadiness = isRecord(status.dependency_readiness) ? status.dependency_readiness : {};
  const dependencies = [
    ...(Array.isArray(packageReadiness.dependencies) ? packageReadiness.dependencies : []),
    ...(Array.isArray(dependencyReadiness.checks) ? dependencyReadiness.checks : []),
  ].filter(isRecord);
  return dependencies.every(requiredDependencyPresent);
}

function projectedAction(entry: JsonRecord, packageId: string): ProjectedPackageAction {
  const recommended = entry.recommended_action_ref;
  if (!isRecord(recommended)) {
    throw new Error(`Package ${packageId} has no projected action for Official Profile convergence.`);
  }
  const availableActions = Array.isArray(entry.available_actions) ? entry.available_actions.filter(isRecord) : [];
  const action = availableActions.find(
    (candidate) => candidate.action_id === recommended.action_id && candidate.action_ref === recommended.action_ref
  );
  if (!action) {
    throw new Error(`Package ${packageId} recommended action is not present in available_actions.`);
  }
  if (
    typeof action.action_id !== 'string' ||
    action.action_id.trim() === '' ||
    typeof action.action_ref !== 'string' ||
    action.action_ref.trim() === '' ||
    !isRecord(action.payload) ||
    !Array.isArray(action.required_payload_fields) ||
    action.required_payload_fields.some((field: unknown) => typeof field !== 'string') ||
    typeof action.confirmation_required !== 'boolean'
  ) {
    throw new Error(`Package ${packageId} projected action has an invalid canonical action shape.`);
  }
  if (action.payload.package_id !== packageId) {
    throw new Error(`Package ${packageId} projected action payload targets another Package.`);
  }
  for (const field of action.required_payload_fields) {
    if (!(field in action.payload)) {
      throw new Error(`Package ${packageId} projected action payload is missing ${field}.`);
    }
  }
  return action as ProjectedPackageAction;
}

function packageSnapshot(payload: JsonRecord, packageId: string) {
  const appState = appStateRecord(payload);
  const agentPackages = isRecord(appState.agent_packages) ? appState.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  const entries = Array.isArray(directory.entries) ? directory.entries.filter(isRecord) : [];
  const entry = entries.find((candidate) => candidate.package_id === packageId);
  if (!entry) {
    throw new Error(`Official Profile Package ${packageId} is absent from the canonical Package directory.`);
  }
  const statusIndex = isRecord(agentPackages.status_index) ? agentPackages.status_index : {};
  const status = statusIndexPackage(statusIndex, packageId);
  return {
    entry,
    installed: entry.installed === true,
    requiredClosurePresent: status !== null && requiredClosurePresent(status),
  };
}

function executeProjectedAction(runtime: OfficialProfileApplyRuntime, action: ProjectedPackageAction, dryRun: boolean) {
  const args = [
    ...PROJECTED_ACTION_COMMAND,
    '--action',
    action.action_id,
    ...(dryRun ? ['--dry-run'] : []),
    ...(Object.keys(action.payload).length > 0 ? ['--payload', JSON.stringify(action.payload)] : []),
    '--json',
  ];
  return parseJsonResult(runtime.execute(args), args);
}

function normalizeRoots(rootPackageIds: string[]) {
  const roots = rootPackageIds.map((value) => value.trim()).filter(Boolean);
  if (roots.length === 0) throw new Error('Official Profile requires at least one desired root Package identity.');
  return [...new Set(roots)];
}

export function applyOfficialProfilePackages(input: {
  intent: OfficialProfileApplyIntent;
  rootPackageIds: string[];
  dryRun?: boolean;
  runtime: OfficialProfileApplyRuntime;
}) {
  if (input.intent !== 'first_install' && input.intent !== 'explicit_restore') {
    throw new Error('Official Profile may only be applied for first_install or explicit_restore.');
  }
  const roots = normalizeRoots(input.rootPackageIds);
  const items: JsonRecord[] = [];

  for (const packageId of roots) {
    try {
      const before = packageSnapshot(fastAppState(input.runtime), packageId);
      if (before.installed && before.requiredClosurePresent) {
        items.push({
          package_id: packageId,
          status: 'already_present',
          action: null,
          action_ref: null,
          changed: false,
          error: null,
        });
        continue;
      }

      const action = projectedAction(before.entry, packageId);
      const actionReadback = executeProjectedAction(input.runtime, action, input.dryRun === true);
      if (input.dryRun) {
        items.push({
          package_id: packageId,
          status: 'validated',
          action: action.action_id,
          action_ref: action.action_ref,
          changed: false,
          action_readback: actionReadback,
          error: null,
        });
        continue;
      }

      const after = packageSnapshot(fastAppState(input.runtime), packageId);
      if (!after.installed || !after.requiredClosurePresent) {
        throw new Error(`Package ${packageId} is not present with its required closure after ${action.action_id}.`);
      }
      items.push({
        package_id: packageId,
        status: before.installed ? 'reconciled' : 'installed',
        action: action.action_id,
        action_ref: action.action_ref,
        changed: true,
        action_readback: actionReadback,
        error: null,
      });
    } catch (error) {
      items.push({
        package_id: packageId,
        status: 'failed',
        action: null,
        action_ref: null,
        changed: false,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  const failed = items.filter((item) => item.status === 'failed').length;
  const succeeded = items.length - failed;
  return {
    version: 'g2',
    official_profile_package_apply: {
      surface_kind: 'opl_app_official_profile_package_apply.v1',
      status: failed === 0 ? (input.dryRun ? 'validated' : 'completed') : succeeded > 0 ? 'partial_failure' : 'failed',
      intent: input.intent,
      dry_run: input.dryRun === true,
      root_package_ids: roots,
      summary: {
        total: items.length,
        succeeded,
        failed,
        changed: items.filter((item) => item.changed === true).length,
        already_present: items.filter((item) => item.status === 'already_present').length,
      },
      items,
      persistence: {
        desired_state_saved: false,
        startup_maintenance_registered: false,
        automatic_reapply_allowed: false,
      },
      projection_boundary: {
        state_source: 'opl app state --profile fast --json',
        action_source: 'directory.entries[].recommended_action_ref+available_actions[]',
        action_executor: 'opl app action execute --action <projected-action-id> --json',
        direct_package_lifecycle_command_used: false,
        package_action_allowlist_owned: false,
        carrier_selection_owned: false,
      },
    },
  };
}

function parseArgs(argv: string[]) {
  let intent: string | null = null;
  let profilePath: string | undefined;
  const rootPackageIds: string[] = [];
  let oplBin = process.env.OPL_BIN?.trim() || 'opl';
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--intent') intent = argv[++index] ?? null;
    else if (token === '--profile') profilePath = argv[++index];
    else if (token === '--root-package-id') rootPackageIds.push(argv[++index] ?? '');
    else if (token === '--opl-bin') oplBin = argv[++index] ?? '';
    else if (token === '--dry-run') dryRun = true;
    else throw new Error(`Unknown option: ${token}`);
  }
  if (intent !== 'first_install' && intent !== 'explicit_restore') {
    throw new Error('--intent must be first_install or explicit_restore.');
  }
  if (!oplBin) throw new Error('--opl-bin must not be empty.');
  if (rootPackageIds.length === 0 && !profilePath) {
    throw new Error('Provide --root-package-id at least once, or --profile for App-repo development use.');
  }
  return { intent, profilePath, rootPackageIds, oplBin, dryRun } as const;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let rootPackageIds = options.rootPackageIds;
  if (rootPackageIds.length === 0) {
    const { readAppProductProfile } = await import('./app-product-profile/profile-contract.ts');
    const profile = readAppProductProfile(options.profilePath);
    if (!profile.official_profile.apply_on.includes(options.intent)) {
      throw new Error(`Official Profile does not allow ${options.intent}.`);
    }
    rootPackageIds = profile.official_profile.desired_root_package_ids;
  }
  const result = applyOfficialProfilePackages({
    intent: options.intent,
    rootPackageIds,
    dryRun: options.dryRun,
    runtime: {
      execute: (args) =>
        spawnSync(options.oplBin, args, {
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 32 * 1024 * 1024,
        }),
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.official_profile_package_apply.summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
