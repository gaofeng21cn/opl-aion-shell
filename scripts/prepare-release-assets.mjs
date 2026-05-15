#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRoot = path.join(root, 'shells', 'aionui');
const artifactsDir = path.resolve(root, process.argv[2] ?? 'build-artifacts');
const outputDir = path.resolve(root, process.argv[3] ?? 'release-assets');

const script = path.join(shellRoot, 'scripts', 'prepare-release-assets.sh');
const result = spawnSync('bash', [script, artifactsDir, outputDir], {
  cwd: shellRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
