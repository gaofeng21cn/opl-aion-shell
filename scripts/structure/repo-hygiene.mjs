#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runReleaseWorkflowPolicyAudit } from './release-workflow-policy.mjs';

const FORBIDDEN_DIRS = new Set([
  'build',
  'out',
  'dist',
  '__pycache__',
  '.codex',
  '.omx',
  '.runtime-program',
  'runtime-state',
]);

const FORBIDDEN_FILES = new Set(['.DS_Store', '.agent-contract-baseline.json']);

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^.\//, '');
}

function isExampleDistributable(filePath) {
  const parts = normalizePath(filePath).split('/');
  return parts.length >= 4 && parts[0] === 'examples' && parts[2] === 'dist';
}

export function findTrackedHygieneViolations(filePaths) {
  return filePaths
    .map(normalizePath)
    .filter(Boolean)
    .filter((filePath) => {
      if (isExampleDistributable(filePath)) return false;

      const parts = filePath.split('/');
      const basename = parts.at(-1);
      if (FORBIDDEN_FILES.has(basename)) return true;
      return parts.some((part) => FORBIDDEN_DIRS.has(part) || part.endsWith('.egg-info'));
    })
    .sort((left, right) => left.localeCompare(right));
}

export function readTrackedFiles(cwd = process.cwd()) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

export function runHygieneAudit(cwd = process.cwd()) {
  return findTrackedHygieneViolations(readTrackedFiles(cwd));
}

function main() {
  const hygieneViolations = runHygieneAudit();
  const releaseWorkflowViolations = runReleaseWorkflowPolicyAudit();
  if (hygieneViolations.length === 0 && releaseWorkflowViolations.length === 0) {
    console.log('repo hygiene audit passed');
    return;
  }

  if (hygieneViolations.length > 0) {
    console.error('Tracked generated/runtime payloads are not allowed:');
    for (const violation of hygieneViolations) {
      console.error(`- ${violation}`);
    }
  }

  if (releaseWorkflowViolations.length > 0) {
    console.error('Obsolete shell release workflows are not allowed:');
    for (const violation of releaseWorkflowViolations) {
      console.error(`- ${violation}`);
    }
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
