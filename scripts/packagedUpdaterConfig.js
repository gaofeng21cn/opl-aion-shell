const fs = require('fs');
const path = require('path');

const PUBLISH_KEYS = ['owner', 'repo', 'provider', 'publishAutoUpdate', 'releaseType'];
const REQUIRED_PUBLISH_KEYS = ['owner', 'repo', 'provider'];

function parseScalar(value) {
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readFlatTopLevelYamlBlock(filePath, blockName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const block = {};
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock) {
      if (line === `${blockName}:`) {
        inBlock = true;
      }
      continue;
    }

    if (/^\S/.test(line) && line.trim() !== '') break;
    const match = line.match(/^\s{2}([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (!match) continue;
    block[match[1]] = parseScalar(match[2]);
  }

  return block;
}

function resolveUpdaterCacheDirName(projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson.name || typeof packageJson.name !== 'string') {
    throw new Error('package.json name is required to derive updaterCacheDirName');
  }
  return `${packageJson.name}-updater`;
}

function buildPackagedUpdaterConfig(projectRoot = path.resolve(__dirname, '..')) {
  const builderConfigPath = path.join(projectRoot, 'packages/desktop/electron-builder.yml');
  const publish = readFlatTopLevelYamlBlock(builderConfigPath, 'publish');
  const missing = REQUIRED_PUBLISH_KEYS.filter((key) => !publish[key]);
  if (missing.length > 0) {
    throw new Error(`electron-builder publish config is missing required key(s): ${missing.join(', ')}`);
  }

  const lines = [];
  for (const key of PUBLISH_KEYS) {
    if (publish[key] !== undefined) {
      lines.push(`${key}: ${publish[key]}`);
    }
  }
  lines.push(`updaterCacheDirName: ${resolveUpdaterCacheDirName(projectRoot)}`);
  return `${lines.join('\n')}\n`;
}

function writePackagedUpdaterConfig(resourcesDir, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const configPath = path.join(resourcesDir, 'app-update.yml');
  const content = buildPackagedUpdaterConfig(projectRoot);

  fs.mkdirSync(resourcesDir, { recursive: true });
  if (!fs.existsSync(configPath) || fs.readFileSync(configPath, 'utf8') !== content) {
    fs.writeFileSync(configPath, content, 'utf8');
  }

  return { configPath, content };
}

function assertPackagedUpdaterConfig(resourcesDir, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const configPath = path.join(resourcesDir, 'app-update.yml');
  const expected = buildPackagedUpdaterConfig(projectRoot);
  const label = path.relative(projectRoot, configPath).replace(/\\/g, '/');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing packaged updater config: ${label}`);
  }
  const actual = fs.readFileSync(configPath, 'utf8');
  if (actual !== expected) {
    throw new Error(`Packaged updater config does not match electron-builder publish config: ${label}`);
  }
}

module.exports = {
  assertPackagedUpdaterConfig,
  buildPackagedUpdaterConfig,
  writePackagedUpdaterConfig,
};
