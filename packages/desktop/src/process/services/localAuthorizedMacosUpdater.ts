/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const INSTALLER_DIR = 'local-authorized-updater';
const DIAGNOSTICS_FILE = 'local-authorized-updater-diagnostics.json';
const FAILED_SCRIPT_RETENTION_MAX_COUNT = 3;
const FAILED_SCRIPT_RETENTION_MAX_AGE_DAYS = 7;
const STAGING_RETENTION_MAX_COUNT = 1;
const STAGING_RETENTION_MAX_AGE_HOURS = 24;

export type LocalAuthorizedMacosUpdatePlan = {
  appPath: string;
  currentPid: number;
  diagnosticsPath: string;
  scriptPath: string;
  stagingRoot: string;
  updateZipPath: string;
  version: string;
};

export type ResolveLocalAuthorizedMacosUpdatePlanInput = {
  appPath: string;
  currentPid: number;
  updateZipPath: string;
  userDataPath: string;
  version: string;
};

export type LocalAuthorizedMacosUpdaterCleanupResult = {
  removedPaths: string[];
  retainedPaths: string[];
};

type LocalAuthorizedMacosUpdaterCleanupOptions = {
  failedScriptMaxAgeDays?: number;
  failedScriptMaxCount?: number;
  nowMs?: number;
  stagingMaxAgeHours?: number;
  stagingMaxCount?: number;
};

export function resolveLocalAuthorizedMacosUpdatePlan(
  input: ResolveLocalAuthorizedMacosUpdatePlanInput
): LocalAuthorizedMacosUpdatePlan {
  const installerRoot = path.join(input.userDataPath, INSTALLER_DIR);
  return {
    appPath: input.appPath,
    currentPid: input.currentPid,
    diagnosticsPath: path.join(input.userDataPath, DIAGNOSTICS_FILE),
    scriptPath: path.join(installerRoot, `install-${input.version}.sh`),
    stagingRoot: path.join(installerRoot, `staging-${input.version}`),
    updateZipPath: input.updateZipPath,
    version: input.version,
  };
}

function shellQuote(value: string | number): string {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
}

function pruneInstallerArtifacts(input: {
  candidates: Array<{ modifiedAtMs: number; path: string }>;
  maxAgeMs: number;
  maxCount: number;
  nowMs: number;
  protectedPath: string;
}): LocalAuthorizedMacosUpdaterCleanupResult {
  const protectedPath = path.resolve(input.protectedPath);
  const retainedPaths: string[] = [];
  const removedPaths: string[] = [];
  let retainedCandidateCount = 0;
  for (const candidate of input.candidates.toSorted((left, right) => right.modifiedAtMs - left.modifiedAtMs)) {
    const candidatePath = path.resolve(candidate.path);
    const isProtected = candidatePath === protectedPath;
    const isExpired = input.nowMs - candidate.modifiedAtMs > input.maxAgeMs;
    if (isProtected || (!isExpired && retainedCandidateCount < input.maxCount)) {
      retainedPaths.push(candidatePath);
      if (!isProtected) retainedCandidateCount += 1;
      continue;
    }
    try {
      fs.rmSync(candidatePath, { recursive: true, force: true });
      removedPaths.push(candidatePath);
    } catch {
      retainedPaths.push(candidatePath);
    }
  }
  return { removedPaths, retainedPaths };
}

export function cleanupLocalAuthorizedMacosUpdaterArtifacts(
  plan: LocalAuthorizedMacosUpdatePlan,
  options: LocalAuthorizedMacosUpdaterCleanupOptions = {}
): LocalAuthorizedMacosUpdaterCleanupResult {
  const installerRoot = path.resolve(path.dirname(plan.scriptPath));
  if (!fs.existsSync(installerRoot)) {
    return { removedPaths: [], retainedPaths: [] };
  }
  const nowMs = options.nowMs ?? Date.now();
  const scripts: Array<{ modifiedAtMs: number; path: string }> = [];
  const stagingRoots: Array<{ modifiedAtMs: number; path: string }> = [];
  try {
    for (const entry of fs.readdirSync(installerRoot, { withFileTypes: true })) {
      const entryPath = path.join(installerRoot, entry.name);
      if (entry.isFile() && /^install-.+\.sh$/.test(entry.name)) {
        scripts.push({ modifiedAtMs: fs.statSync(entryPath).mtimeMs, path: entryPath });
      } else if ((entry.isDirectory() || entry.isSymbolicLink()) && /^staging-.+/.test(entry.name)) {
        stagingRoots.push({ modifiedAtMs: fs.lstatSync(entryPath).mtimeMs, path: entryPath });
      }
    }
  } catch {
    return { removedPaths: [], retainedPaths: [] };
  }
  const failedScripts = pruneInstallerArtifacts({
    candidates: scripts,
    maxAgeMs: (options.failedScriptMaxAgeDays ?? FAILED_SCRIPT_RETENTION_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000,
    maxCount: options.failedScriptMaxCount ?? FAILED_SCRIPT_RETENTION_MAX_COUNT,
    nowMs,
    protectedPath: plan.scriptPath,
  });
  const staging = pruneInstallerArtifacts({
    candidates: stagingRoots,
    maxAgeMs: (options.stagingMaxAgeHours ?? STAGING_RETENTION_MAX_AGE_HOURS) * 60 * 60 * 1000,
    maxCount: options.stagingMaxCount ?? STAGING_RETENTION_MAX_COUNT,
    nowMs,
    protectedPath: plan.stagingRoot,
  });
  return {
    removedPaths: [...failedScripts.removedPaths, ...staging.removedPaths],
    retainedPaths: [...failedScripts.retainedPaths, ...staging.retainedPaths],
  };
}

export function buildLocalAuthorizedMacosInstallerScript(plan: LocalAuthorizedMacosUpdatePlan): string {
  const quotedAppPath = shellQuote(plan.appPath);
  const quotedDiagnosticsPath = shellQuote(plan.diagnosticsPath);
  const quotedPid = shellQuote(plan.currentPid);
  const quotedScriptPath = shellQuote(plan.scriptPath);
  const quotedStagingRoot = shellQuote(plan.stagingRoot);
  const quotedUpdateZipPath = shellQuote(plan.updateZipPath);
  const quotedVersion = shellQuote(plan.version);

  return `#!/usr/bin/env bash
set -u

app_path=${quotedAppPath}
current_pid=${quotedPid}
diagnostics_path=${quotedDiagnosticsPath}
script_path=${quotedScriptPath}
staging_root=${quotedStagingRoot}
update_zip_path=${quotedUpdateZipPath}
version=${quotedVersion}

write_diagnostics() {
  local status="$1"
  local reason="$2"
  mkdir -p "$(dirname "$diagnostics_path")"
  node - "$diagnostics_path" "$status" "$reason" "$app_path" "$version" "$codesign_status" "$spctl_status" "$quarantine_after" <<'NODE'
const fs = require('node:fs');
const [diagnosticsPath, status, reason, appPath, version, codesignStatus, spctlStatus, quarantineAfter] = process.argv.slice(2);
fs.writeFileSync(diagnosticsPath, JSON.stringify({
  schema: 'opl_local_authorized_updater_diagnostics.v1',
  status,
  reason,
  app_path: appPath,
  version,
  stable_release_path: 'local_authorized_unsigned',
  apple_developer_id_required: false,
  gatekeeper_required: false,
  local_authorization_required: true,
  quarantine_removal_required: true,
  codesign_status: codesignStatus,
  spctl_status: spctlStatus,
  quarantine_after: Number.isFinite(Number(quarantineAfter)) ? Number(quarantineAfter) : null,
  recorded_at: new Date().toISOString(),
}, null, 2) + '\\n');
NODE
}

run_with_sudo_fallback() {
  local label="$1"
  shift
  if "$@"; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi
  return 1
}

cleanup_staging() {
  rm -rf "$staging_root"
}

codesign_status="not_checked"
spctl_status="not_checked"
quarantine_after="-1"
trap cleanup_staging EXIT

for _ in $(seq 1 120); do
  if ! kill -0 "$current_pid" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if kill -0 "$current_pid" >/dev/null 2>&1; then
  write_diagnostics "failed" "previous_app_process_still_running"
  exit 1
fi

rm -rf "$staging_root"
mkdir -p "$staging_root"
if ! unzip -q "$update_zip_path" -d "$staging_root"; then
  write_diagnostics "failed" "unzip_failed"
  exit 1
fi

source_app="$(find "$staging_root" -maxdepth 3 -type d -name "One Person Lab.app" | sort | head -n 1)"
if [ -z "$source_app" ]; then
  write_diagnostics "failed" "missing_app_bundle_in_zip"
  exit 1
fi

if ! run_with_sudo_fallback mkdir mkdir -p "$(dirname "$app_path")"; then
  write_diagnostics "failed" "create_app_parent_failed"
  exit 1
fi
if [ -e "$app_path" ] && ! run_with_sudo_fallback remove-existing-app rm -rf "$app_path"; then
  write_diagnostics "failed" "remove_existing_app_failed"
  exit 1
fi
if ! run_with_sudo_fallback copy-app ditto "$source_app" "$app_path"; then
  write_diagnostics "failed" "copy_app_failed"
  exit 1
fi

run_with_sudo_fallback clear-quarantine xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true

if codesign --verify --deep --strict --verbose=2 "$app_path" >/dev/null 2>&1; then
  codesign_status="passed"
else
  codesign_status="failed_allowed_unsigned"
fi
if spctl --assess --type execute --verbose=4 "$app_path" >/dev/null 2>&1; then
  spctl_status="passed"
else
  if [ "$codesign_status" = "passed" ]; then
    spctl_status="rejected_allowed_unsigned"
  else
    spctl_status="failed_allowed_unsigned"
  fi
fi

quarantine_after="$(find "$app_path" -print0 | xargs -0 xattr -p com.apple.quarantine 2>/dev/null | wc -l | tr -d ' ')"
write_diagnostics "installed" ""
open "$app_path"
rm -f "$update_zip_path"
rm -f "$script_path"
`;
}

export function writeLocalAuthorizedMacosInstallerScript(plan: LocalAuthorizedMacosUpdatePlan): void {
  fs.mkdirSync(path.dirname(plan.scriptPath), { recursive: true });
  fs.writeFileSync(plan.scriptPath, buildLocalAuthorizedMacosInstallerScript(plan), { encoding: 'utf8', mode: 0o755 });
}

export function launchLocalAuthorizedMacosInstaller(plan: LocalAuthorizedMacosUpdatePlan): void {
  cleanupLocalAuthorizedMacosUpdaterArtifacts(plan);
  writeLocalAuthorizedMacosInstallerScript(plan);
  const child = spawn('/bin/bash', [plan.scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
