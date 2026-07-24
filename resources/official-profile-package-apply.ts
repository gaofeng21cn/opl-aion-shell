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

function packageStatus(runtime: OfficialProfileApplyRuntime, packageId: string) {
  const args = ['packages', 'status', '--package-id', packageId, '--json'];
  const payload = parseJsonResult(runtime.execute(args), args);
  const status = payload.opl_agent_package_status;
  if (!isRecord(status)) throw new Error(`Package ${packageId} status readback is missing opl_agent_package_status.`);
  return status;
}

function rootPresence(status: JsonRecord) {
  const installed = Number(status.installed_package_count ?? 0) > 0;
  const dependencies = Array.isArray(status.package_dependency_readiness?.dependencies)
    ? status.package_dependency_readiness.dependencies.filter(
        (entry: unknown) => isRecord(entry) && entry.required !== false
      )
    : [];
  const absenceReasons = new Set([
    'dependency_lock_missing',
    'dependency_disabled',
    'required_exports_missing',
    'required_modules_missing',
  ]);
  const requiredClosurePresent = dependencies.every(
    (dependency: JsonRecord) =>
      dependency.status !== 'missing' &&
      !(
        Array.isArray(dependency.reasons) &&
        dependency.reasons.some((reason: unknown) => typeof reason === 'string' && absenceReasons.has(reason))
      )
  );
  return { installed, requiredClosurePresent };
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
      const before = rootPresence(packageStatus(input.runtime, packageId));
      if (before.installed && before.requiredClosurePresent) {
        items.push({ package_id: packageId, status: 'already_present', action: null, changed: false, error: null });
        continue;
      }

      const action = before.installed ? 'update' : 'install';
      const args = ['packages', action, packageId, ...(input.dryRun ? ['--dry-run'] : []), '--json'];
      const actionReadback = parseJsonResult(input.runtime.execute(args), args);
      if (input.dryRun) {
        items.push({
          package_id: packageId,
          status: 'validated',
          action,
          changed: false,
          action_readback: actionReadback,
          error: null,
        });
        continue;
      }

      const after = rootPresence(packageStatus(input.runtime, packageId));
      if (!after.installed || !after.requiredClosurePresent) {
        throw new Error(`Package ${packageId} is not present with its required closure after ${action}.`);
      }
      items.push({
        package_id: packageId,
        status: action === 'install' ? 'installed' : 'reconciled',
        action,
        changed: true,
        action_readback: actionReadback,
        error: null,
      });
    } catch (error) {
      items.push({
        package_id: packageId,
        status: 'failed',
        action: null,
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
