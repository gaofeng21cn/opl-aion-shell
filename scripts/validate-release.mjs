#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRoot = path.join(root, 'shells', 'aionui');
const outputDir = path.resolve(root, process.argv[2] ?? 'release-assets');
const script = path.join(shellRoot, 'scripts', 'verify-release-assets.sh');

const result = spawnSync('bash', [script, outputDir], {
  cwd: shellRoot,
  stdio: 'inherit',
  env: process.env,
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(outputDir)) {
  console.error(`Release asset directory does not exist: ${outputDir}`);
  process.exit(1);
}

const metadataFiles = readdirSync(outputDir)
  .filter((name) => /^latest.*\.ya?ml$/.test(name))
  .sort();

let errors = 0;
for (const fileName of metadataFiles) {
  const filePath = path.join(outputDir, fileName);
  const text = readFileSync(filePath, 'utf8');
  if (/One-Person-Lab-Full|Full-/i.test(text)) {
    console.error(`FAIL: standard updater metadata references a Full first-install asset: ${fileName}`);
    errors += 1;
  }
}

if (errors > 0) {
  process.exit(1);
}

console.log('PASS: standard updater metadata excludes Full first-install assets');
