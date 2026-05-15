#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(root, 'contracts', 'app-shell-adapter.json');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const parsed = {
    chunkSize: Number.parseInt(process.env.OPL_APP_TEST_CHUNK_SIZE ?? '1', 10),
    maxWorkers: Number.parseInt(process.env.OPL_APP_TEST_MAX_WORKERS ?? '1', 10),
    project: 'all',
    fileParallelism: false,
    passThrough: [],
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--chunk-size') {
      const value = Number.parseInt(argv[++index] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Expected a positive integer after --chunk-size');
      }
      parsed.chunkSize = value;
      continue;
    }
    if (arg === '--max-workers') {
      const value = Number.parseInt(argv[++index] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Expected a positive integer after --max-workers');
      }
      parsed.maxWorkers = value;
      continue;
    }
    if (arg === '--project') {
      const value = argv[++index];
      if (!['all', 'node', 'dom'].includes(value)) {
        throw new Error('Expected one of all, node, dom after --project');
      }
      parsed.project = value;
      continue;
    }
    if (arg === '--file-parallelism') {
      parsed.fileParallelism = true;
      continue;
    }
    if (arg === '--') {
      parsed.passThrough.push(...argv.slice(index + 1));
      break;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).sort();
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (stats.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function collectTests(shellRoot) {
  const testFiles = walkFiles(path.join(shellRoot, 'tests'))
    .map((filePath) => toPosix(path.relative(shellRoot, filePath)))
    .filter((relativePath) => /\.(ts|tsx)$/.test(relativePath));

  const dom = [];
  const node = [];

  for (const relativePath of testFiles) {
    if (/^tests\/unit\/.*\.dom\.test\.tsx?$/.test(relativePath)) {
      dom.push(relativePath);
      continue;
    }
    if (
      /^tests\/unit\/.*\.test\.ts$/.test(relativePath) ||
      /^tests\/unit\/(?:.*\/)?test_[^/]+\.ts$/.test(relativePath) ||
      /^tests\/integration\/.*\.test\.ts$/.test(relativePath) ||
      /^tests\/regression\/.*\.test\.ts$/.test(relativePath)
    ) {
      node.push(relativePath);
    }
  }

  return {
    node: node.sort(),
    dom: dom.sort(),
  };
}

function chunk(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function runVitestChunk({ shellRoot, project, files, chunkIndex, chunkCount, fileParallelism, maxWorkers, passThrough }) {
  const args = ['vitest', 'run', '--project', project, `--maxWorkers=${maxWorkers}`];
  if (!fileParallelism) {
    args.push('--no-file-parallelism');
  }
  args.push(...passThrough, ...files);

  console.log(`\n==> ${project} chunk ${chunkIndex + 1}/${chunkCount} (${files.length} file(s))`);
  const result = spawnSync('bunx', args, {
    cwd: shellRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${project} chunk ${chunkIndex + 1}/${chunkCount} failed`);
  }
}

function runProject({ shellRoot, project, files, chunkSize, fileParallelism, maxWorkers, passThrough }) {
  if (files.length === 0) {
    console.log(`No ${project} tests discovered.`);
    return;
  }

  const chunks = chunk(files, chunkSize);
  console.log(`Discovered ${files.length} ${project} test file(s); running ${chunks.length} chunk(s).`);
  chunks.forEach((filesInChunk, index) => {
    runVitestChunk({
      shellRoot,
      project,
      files: filesInChunk,
      chunkIndex: index,
      chunkCount: chunks.length,
      fileParallelism,
      maxWorkers,
      passThrough,
    });
  });
}

const args = parseArgs(process.argv);
const contract = readJson(contractPath);
const shellRoot = path.join(root, contract.shell_root);

if (contract.active_shell !== 'aionui' || contract.shell_root !== 'shells/aionui') {
  throw new Error(`Unsupported active shell: ${contract.active_shell} at ${contract.shell_root}`);
}
if (!existsSync(path.join(shellRoot, 'vitest.config.ts'))) {
  throw new Error(`Missing active shell Vitest config: ${path.relative(root, path.join(shellRoot, 'vitest.config.ts'))}`);
}

const tests = collectTests(shellRoot);
const selectedProjects = args.project === 'all' ? ['node', 'dom'] : [args.project];

for (const project of selectedProjects) {
  runProject({
    shellRoot,
    project,
    files: tests[project],
    chunkSize: args.chunkSize,
    fileParallelism: args.fileParallelism,
    maxWorkers: args.maxWorkers,
    passThrough: args.passThrough,
  });
}

console.log(`\nActive shell tests passed (${selectedProjects.map((project) => `${tests[project].length} ${project}`).join(', ')} file(s)).`);
