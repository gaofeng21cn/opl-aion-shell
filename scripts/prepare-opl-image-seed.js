#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = process.env.OPL_IMAGE_SEED_PROJECT_ROOT
  ? path.resolve(process.env.OPL_IMAGE_SEED_PROJECT_ROOT)
  : path.resolve(__dirname, '..');
const seedDir = path.join(projectRoot, 'resources', 'opl-image-seed');
const payloadDir = path.join(seedDir, 'payload');
const packageVersion = require(path.join(projectRoot, 'package.json')).version;

function fail(message) {
  throw new Error(message);
}

function ensureDirectory(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    fail(`Expected directory does not exist: ${directory}`);
  }
}

function walkEntries(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    visit(current, stat);
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) {
      stack.push(path.join(current, entry));
    }
  }
}

function relativizeInternalSymlinks(root) {
  ensureDirectory(root);
  walkEntries(root, (current, stat) => {
    if (!stat.isSymbolicLink()) return;
    const target = fs.readlinkSync(current);
    if (!path.isAbsolute(target)) return;
    const relativeToPayload = path.relative(payloadDir, target);
    if (relativeToPayload.startsWith('..') || path.isAbsolute(relativeToPayload)) return;
    const relativeTarget = path.relative(path.dirname(current), path.join(payloadDir, relativeToPayload));
    fs.unlinkSync(current);
    fs.symlinkSync(relativeTarget || '.', current);
  });
}

function directoryDigest(root) {
  ensureDirectory(root);
  const files = [];
  walkEntries(root, (current, stat) => {
    if (stat.isFile() || stat.isSymbolicLink()) files.push(current);
  });
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(file);
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
        fail(`Seed payload contains broken symlink: ${file} -> ${target}`);
      }
      hash.update(`symlink:${target}`);
    } else {
      hash.update(fs.readFileSync(file));
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

function directorySize(root) {
  ensureDirectory(root);
  let total = 0;
  walkEntries(root, (_current, stat) => {
    if (stat.isFile() || stat.isSymbolicLink()) total += stat.size;
  });
  return total;
}

function textFile(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

function component(id, input = {}) {
  const componentPayloadDir = path.join(payloadDir, id);
  const digest = directoryDigest(componentPayloadDir);
  return {
    id,
    version: input.version || packageVersion,
    source: input.source || 'image_preheated_payload',
    payload_path: `payload/${id}`,
    receipt_kind: `${id}_seed_payload_receipt`,
    sha256: digest,
    checksum_sha256: digest,
    source_fingerprint: input.sourceFingerprint || `sha256:${digest}`,
    size_bytes: directorySize(componentPayloadDir),
  };
}

ensureDirectory(path.join(payloadDir, 'opl_framework'));
ensureDirectory(path.join(payloadDir, 'codex_cli'));
ensureDirectory(path.join(payloadDir, 'companion_skills'));
ensureDirectory(path.join(payloadDir, 'domain_modules'));

relativizeInternalSymlinks(payloadDir);

const frameworkCommit = textFile(path.join(payloadDir, 'opl_framework', 'OPL_FRAMEWORK_COMMIT'));
const frameworkRef = textFile(path.join(payloadDir, 'opl_framework', 'OPL_FRAMEWORK_REF'));
const codexSpec = textFile(path.join(payloadDir, 'codex_cli', 'OPL_CODEX_NPM_SPEC'));

const components = [
  component('opl_framework', {
    source: 'ghcr_image_build_framework_seed',
    sourceFingerprint: frameworkCommit
      ? `git:${frameworkRef || 'main'}:${frameworkCommit}`
      : undefined,
  }),
  component('codex_cli', {
    source: codexSpec || 'npm:@openai/codex',
  }),
  component('companion_skills', {
    source: 'opl_aion_shell_resources_hub',
  }),
  component('domain_modules', {
    source: 'opl_package_channel_startup_reconcile_seed',
  }),
];

fs.mkdirSync(seedDir, { recursive: true });
fs.writeFileSync(
  path.join(seedDir, 'metadata.json'),
  JSON.stringify(
    {
      schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
      strategy: 'payload_preheated',
      image_profile: 'webui-full',
      applies_to: 'docker-webui-runtime-image',
      data_dir: '/data',
      projects_dir: '/projects',
      components,
      full_profile: {
        components,
      },
      payload_dir: 'payload',
      note: 'Full WebUI images carry preheated runtime payloads. Startup maintenance applies this seed into /data and writes install receipts.',
    },
    null,
    2,
  ) + '\n',
);

console.log(`Prepared OPL image seed metadata at ${path.join(seedDir, 'metadata.json')}`);
