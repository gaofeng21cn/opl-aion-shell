#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW_DIR = '.github/workflows';
const WORKFLOW_EXTENSIONS = new Set(['.yml', '.yaml']);
const LEGACY_RELEASE_WORKFLOW_NAMES = new Set(['Build and Release', 'Distribute Release Assets']);

const RELEASE_PUBLISHING_PATTERNS = [
  /softprops\/action-gh-release/i,
  /\bgh\s+release\s+(?:create|edit|upload|delete)\b/i,
  /\belectron-builder\b[^\n]*--publish=(?!never\b)/i,
  /\b--publish=(?:always|onTag|onTagOrDraft)\b/i,
];

const RELEASE_DISTRIBUTION_PATTERNS = [
  /aws-actions\/configure-aws-credentials/i,
  /\baws\s+s3\s+(?:cp|sync)\b/i,
  /\bgh\s+release\s+download\b/i,
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^.\//, '');
}

function listWorkflowFiles(cwd = process.cwd()) {
  const workflowDir = path.join(cwd, WORKFLOW_DIR);
  if (!existsSync(workflowDir)) return [];

  const output = execFileSync('git', ['ls-files', '-z', WORKFLOW_DIR], { cwd, encoding: 'utf8' });
  return output
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .filter((filePath) => WORKFLOW_EXTENSIONS.has(path.extname(filePath)));
}

function extractWorkflowName(source) {
  const match = source.match(/^name:\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/m);
  return match?.[1]?.trim() ?? '';
}

function extractOnBlock(source) {
  const lines = source.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^(?:on|"on"|'on'):\s*/.test(line));
  if (onIndex === -1) return '';

  const firstLine = lines[onIndex] ?? '';
  const inline = firstLine.replace(/^(?:on|"on"|'on'):\s*/, '').trim();
  const block = [inline];
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\S/.test(line) && line.trim() !== '') break;
    block.push(line);
  }
  return block.join('\n');
}

function extractTriggerFacts(source) {
  const onBlock = extractOnBlock(source);
  return {
    release: /(?:^|\n)\s*release\s*:/i.test(onBlock) || /\brelease\b/i.test(onBlock.split('\n')[0] ?? ''),
    schedule: /(?:^|\n)\s*schedule\s*:/i.test(onBlock) || /\bschedule\b/i.test(onBlock.split('\n')[0] ?? ''),
    pushTags: /(?:^|\n)\s*push\s*:[\s\S]*?(?:^|\n)\s*tags\s*:/im.test(onBlock),
  };
}

function matchesAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

export function inspectWorkflowPolicy(filePath, source) {
  const name = extractWorkflowName(source);
  const triggers = extractTriggerFacts(source);
  const hasAutomaticReleaseTrigger = triggers.release || triggers.schedule || triggers.pushTags;
  const publishesRelease = matchesAny(source, RELEASE_PUBLISHING_PATTERNS);
  const distributesReleaseAssets = matchesAny(source, RELEASE_DISTRIBUTION_PATTERNS);
  const violations = [];

  if (LEGACY_RELEASE_WORKFLOW_NAMES.has(name)) {
    violations.push(`${filePath}: legacy release workflow "${name}" must stay retired`);
  }

  if (hasAutomaticReleaseTrigger && publishesRelease) {
    violations.push(`${filePath}: automatic release publishing belongs to one-person-lab-app`);
  }

  if (hasAutomaticReleaseTrigger && distributesReleaseAssets) {
    violations.push(`${filePath}: automatic release asset distribution belongs to one-person-lab-app`);
  }

  return violations;
}

export function findReleaseWorkflowPolicyViolations(fileSources) {
  return fileSources
    .flatMap(({ filePath, source }) => inspectWorkflowPolicy(normalizePath(filePath), source))
    .sort((left, right) => left.localeCompare(right));
}

export function runReleaseWorkflowPolicyAudit(cwd = process.cwd()) {
  const fileSources = listWorkflowFiles(cwd).map((filePath) => ({
    filePath,
    source: readFileSync(path.join(cwd, filePath), 'utf8'),
  }));
  return findReleaseWorkflowPolicyViolations(fileSources);
}

function main() {
  const violations = runReleaseWorkflowPolicyAudit();
  if (violations.length === 0) {
    console.log('release workflow policy audit passed');
    return;
  }

  console.error('Obsolete shell release workflows are not allowed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
