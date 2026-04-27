#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');
const acorn = require('acorn');

const DEFAULT_OUT_DIR = path.resolve(__dirname, '..', 'out');
const FORBIDDEN_ASAR_PATTERNS = [
  /^node_modules\/@office-ai\/aioncli-core(?:\/|$)/,
  /^node_modules\/@google\/genai(?:\/|$)/,
  /^node_modules\/googleapis(?:\/|$)/,
  /^node_modules\/googleapis-common(?:\/|$)/,
  /^node_modules\/web-tree-sitter(?:\/|$)/,
  /^node_modules\/electron-winstaller(?:\/|$)/,
  /^node_modules\/postject(?:\/|$)/,
  /^node_modules\/@electron\/windows-sign(?:\/|$)/,
  /^node_modules\/mermaid(?:\/|$)/,
  /^node_modules\/streamdown(?:\/|$)/,
  /^node_modules\/cytoscape(?:\/|$)/,
  /(?:^|\/)bundled-bun(?:\/|$)/,
  /(?:^|\/)bundled-aionrs(?:\/|$)/,
  /^out\/renderer\/assets\/(?:Gemini|Aionrs|useGemini|useAionrs)[^/]*\.(?:js|css)$/,
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    asars: [],
    apps: [],
    outDir: DEFAULT_OUT_DIR,
    entries: ['out/main/index.js'],
    scanAll: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--asar') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --asar');
      parsed.asars.push(path.resolve(value));
      continue;
    }
    if (arg === '--app') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --app');
      parsed.apps.push(path.resolve(value));
      continue;
    }
    if (arg === '--out') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --out');
      parsed.outDir = path.resolve(value);
      continue;
    }
    if (arg === '--entry') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --entry');
      parsed.entries.push(stripLeadingSlash(value));
      continue;
    }
    if (arg === '--scan-all') {
      parsed.scanAll = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function findAsarsInDir(rootDir) {
  const found = [];
  if (!fs.existsSync(rootDir)) return found;

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'app.asar') {
        found.push(fullPath);
      }
    }
  }

  return found.sort();
}

function resolveAsarTargets(parsed) {
  const targets = new Set(parsed.asars);

  for (const appPath of parsed.apps) {
    const macAsar = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    const unpackedAsar = path.join(appPath, 'resources', 'app.asar');
    if (fs.existsSync(macAsar)) targets.add(macAsar);
    if (fs.existsSync(unpackedAsar)) targets.add(unpackedAsar);
  }

  if (targets.size === 0) {
    for (const asarPath of findAsarsInDir(parsed.outDir)) {
      targets.add(asarPath);
    }
  }

  return [...targets].sort();
}

function stripLeadingSlash(entry) {
  return entry.replace(/^\/+/, '');
}

function shouldScanFile(filePath) {
  if (!/\.(?:cjs|js|mjs)$/.test(filePath)) return false;
  return (
    filePath.startsWith('out/main/') || filePath.startsWith('out/preload/') || filePath.startsWith('node_modules/')
  );
}

function shouldScanInitialFile(filePath) {
  if (!/\.(?:cjs|js|mjs)$/.test(filePath)) return false;
  return filePath.startsWith('out/main/') || filePath.startsWith('out/preload/');
}

function stripJsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function isBuiltinModule(specifier) {
  const builtinModules = require('module').builtinModules;
  const normalized = specifier.replace(/^node:/, '');
  return (
    specifier === 'electron' ||
    builtinModules.includes(specifier) ||
    builtinModules.includes(normalized) ||
    specifier.startsWith('electron/')
  );
}

function parseJavaScript(source, filePath) {
  const baseOptions = {
    ecmaVersion: 'latest',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
  };
  const sourceTypes = filePath.endsWith('.mjs') ? ['module', 'script'] : ['script', 'module'];
  let lastError;

  for (const sourceType of sourceTypes) {
    try {
      return acorn.parse(source, {
        ...baseOptions,
        sourceType,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function collectImportSpecifiers(source, filePath) {
  const ast = parseJavaScript(source, filePath);
  const specifiers = [];
  const stack = [ast];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== 'string') continue;

    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source?.type === 'Literal' &&
      typeof node.source.value === 'string'
    ) {
      specifiers.push(node.source.value);
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require' &&
      node.arguments?.[0]?.type === 'Literal' &&
      typeof node.arguments[0].value === 'string'
    ) {
      specifiers.push(node.arguments[0].value);
    }

    if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
      specifiers.push(node.source.value);
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item.type === 'string') stack.push(item);
        }
      } else if (value && typeof value.type === 'string') {
        stack.push(value);
      }
    }
  }

  return specifiers;
}

function stripSpecifierSuffix(specifier) {
  return specifier.replace(/[?#].*$/, '');
}

function candidatePaths(basePath) {
  return [
    basePath,
    `${basePath}.js`,
    `${basePath}.json`,
    `${basePath}.node`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.posix.join(basePath, 'index.js'),
    path.posix.join(basePath, 'index.json'),
    path.posix.join(basePath, 'index.node'),
    path.posix.join(basePath, 'index.mjs'),
    path.posix.join(basePath, 'index.cjs'),
  ];
}

function makeArchiveAccess(asarPath, entries) {
  const entrySet = new Set(entries);
  const statCache = new Map();
  const packageJsonCache = new Map();

  const stat = (entry) => {
    if (!entrySet.has(entry)) return null;
    if (statCache.has(entry)) return statCache.get(entry);
    try {
      const value = asar.statFile(asarPath, entry);
      statCache.set(entry, value);
      return value;
    } catch {
      statCache.set(entry, null);
      return null;
    }
  };

  const isFile = (entry) => {
    const value = stat(entry);
    return Boolean(value && !value.files);
  };

  const isDirectory = (entry) => {
    const value = stat(entry);
    return Boolean(value && value.files);
  };

  const readFile = (entry) => asar.extractFile(asarPath, entry).toString('utf8');

  const readPackageJson = (entry) => {
    if (packageJsonCache.has(entry)) return packageJsonCache.get(entry);
    if (!isFile(entry)) {
      packageJsonCache.set(entry, null);
      return null;
    }
    try {
      const parsed = JSON.parse(readFile(entry));
      packageJsonCache.set(entry, parsed);
      return parsed;
    } catch {
      packageJsonCache.set(entry, null);
      return null;
    }
  };

  return {
    isFile,
    isDirectory,
    readFile,
    readPackageJson,
  };
}

function resolveFileLike(archive, basePath) {
  for (const candidate of candidatePaths(basePath)) {
    if (archive.isFile(candidate)) return candidate;
  }

  if (archive.isDirectory(basePath)) {
    const packageJsonPath = path.posix.join(basePath, 'package.json');
    const packageJson = archive.readPackageJson(packageJsonPath);
    const mainValue =
      typeof packageJson?.main === 'string'
        ? packageJson.main
        : typeof packageJson?.module === 'string'
          ? packageJson.module
          : undefined;
    if (mainValue) {
      const resolvedMain = resolveFileLike(archive, path.posix.normalize(path.posix.join(basePath, mainValue)));
      if (resolvedMain) return resolvedMain;
    }
  }

  return null;
}

function resolveRelativeImport(archive, fromFile, specifier) {
  const baseDir = path.posix.dirname(fromFile);
  const resolved = path.posix.normalize(path.posix.join(baseDir, stripSpecifierSuffix(specifier)));
  return resolveFileLike(archive, resolved);
}

function packageParts(specifier) {
  const clean = stripSpecifierSuffix(specifier);
  const parts = clean.split('/');
  if (clean.startsWith('@')) {
    if (parts.length < 2) return null;
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath: parts.slice(2).join('/'),
    };
  }
  return {
    packageName: parts[0],
    subpath: parts.slice(1).join('/'),
  };
}

function selectExportTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const preferredConditions = ['require', 'node', 'default', 'import', 'module'];
  for (const condition of preferredConditions) {
    const selected = selectExportTarget(value[condition]);
    if (selected) return selected;
  }

  for (const nested of Object.values(value)) {
    const selected = selectExportTarget(nested);
    if (selected) return selected;
  }

  return null;
}

function resolvePackageExport(archive, packageRoot, subpath, packageJson) {
  const exportsField = packageJson?.exports;
  if (!exportsField) return null;

  const key = subpath ? `./${subpath}` : '.';
  if (typeof exportsField === 'string') {
    if (key !== '.') return null;
    return resolveFileLike(archive, path.posix.normalize(path.posix.join(packageRoot, exportsField)));
  }

  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) return null;

  const direct = selectExportTarget(exportsField[key]);
  if (direct) {
    return resolveFileLike(archive, path.posix.normalize(path.posix.join(packageRoot, direct)));
  }

  for (const [pattern, value] of Object.entries(exportsField)) {
    if (!pattern.includes('*')) continue;
    const [prefix, suffix] = pattern.split('*');
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;

    const wildcard = key.slice(prefix.length, key.length - suffix.length);
    const target = selectExportTarget(value);
    if (!target || !target.includes('*')) continue;

    return resolveFileLike(archive, path.posix.normalize(path.posix.join(packageRoot, target.replace('*', wildcard))));
  }

  return null;
}

function ancestorDirs(fromFile) {
  const dirs = [];
  let current = path.posix.dirname(fromFile);
  while (current && current !== '.') {
    dirs.push(current);
    const parent = path.posix.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  dirs.push('');
  return dirs;
}

function resolveBareImport(archive, fromFile, specifier) {
  if (isBuiltinModule(specifier)) return '<builtin>';
  const parts = packageParts(specifier);
  if (!parts) return null;

  for (const dir of ancestorDirs(fromFile)) {
    const packageRoot = path.posix.join(dir, 'node_modules', parts.packageName);
    if (!archive.isDirectory(packageRoot)) continue;
    const packageJson = archive.readPackageJson(path.posix.join(packageRoot, 'package.json'));

    const exportResolved = resolvePackageExport(archive, packageRoot, parts.subpath, packageJson);
    if (exportResolved) return exportResolved;

    if (parts.subpath) {
      return resolveFileLike(archive, path.posix.join(packageRoot, parts.subpath));
    }

    return resolveFileLike(archive, packageRoot);
  }

  return null;
}

function resolveImport(archive, fromFile, specifier) {
  if (specifier.startsWith('.')) {
    return resolveRelativeImport(archive, fromFile, specifier);
  }
  return resolveBareImport(archive, fromFile, specifier);
}

function validateAsar(asarPath, options = {}) {
  if (!fs.existsSync(asarPath)) {
    throw new Error(`app.asar not found: ${asarPath}`);
  }

  const entries = asar.listPackage(asarPath).map(stripLeadingSlash);
  const archive = makeArchiveAccess(asarPath, entries);
  const entryFiles = entries.filter((entry) => path.posix.extname(entry));
  const entryCandidates = options.entries?.length ? options.entries : ['out/main/index.js'];
  const jsFiles = options.scanAll ? entries.filter(shouldScanInitialFile) : [];
  const queue = options.scanAll ? [...jsFiles] : entryCandidates.map(stripLeadingSlash);
  const scanned = new Set();
  const missing = [];
  const unresolvedBare = [];
  const parseFailures = [];
  const forbidden = entries.filter((entry) => FORBIDDEN_ASAR_PATTERNS.some((pattern) => pattern.test(entry)));

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (scanned.has(filePath)) continue;
    scanned.add(filePath);

    let source;
    try {
      source = archive.readFile(filePath);
    } catch (error) {
      missing.push({
        from: filePath,
        specifier: '<self>',
        expected: filePath,
        reason: error.message,
      });
      continue;
    }

    let specifiers;
    try {
      specifiers = collectImportSpecifiers(source, filePath);
    } catch (error) {
      parseFailures.push({
        file: filePath,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    for (const specifier of specifiers) {
      const resolved = resolveImport(archive, filePath, specifier);
      if (resolved) {
        if (
          resolved !== '<builtin>' &&
          /\.(?:cjs|js|mjs)$/.test(resolved) &&
          (options.scanAll || shouldScanFile(resolved)) &&
          !scanned.has(resolved)
        ) {
          queue.push(resolved);
        }
        continue;
      }

      const issue = {
        from: filePath,
        specifier,
        expected: specifier.startsWith('.')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(filePath), stripSpecifierSuffix(specifier)))
          : `node_modules/${specifier}`,
      };

      if (specifier.startsWith('.')) {
        missing.push(issue);
      } else {
        unresolvedBare.push(issue);
      }
    }
  }

  return {
    asarPath,
    files: entryFiles.length,
    scanned: scanned.size,
    missing,
    unresolvedBare,
    parseFailures,
    forbidden,
  };
}

function main() {
  const parsed = parseArgs(process.argv);
  const targets = resolveAsarTargets(parsed);
  if (targets.length === 0) {
    throw new Error(`No app.asar found under ${parsed.outDir}`);
  }

  let hasFailure = false;
  for (const target of targets) {
    const result = validateAsar(target, {
      entries: parsed.entries,
      scanAll: parsed.scanAll,
    });
    console.log(`🔎 Runtime import check: ${target}`);
    console.log(`   scanned ${result.scanned} JS runtime files (${result.files} packaged files)`);

    if (result.forbidden.length > 0) {
      hasFailure = true;
      console.error(
        `   ❌ ${result.forbidden.length} forbidden packaged entr${result.forbidden.length === 1 ? 'y' : 'ies'}:`
      );
      for (const entry of result.forbidden.slice(0, 80)) {
        console.error(`      ${entry}`);
      }
      if (result.forbidden.length > 80) {
        console.error(`      ... ${result.forbidden.length - 80} more omitted`);
      }
    }

    if (result.parseFailures.length > 0) {
      hasFailure = true;
      console.error(
        `   ❌ ${result.parseFailures.length} JS runtime file${result.parseFailures.length === 1 ? '' : 's'} could not be parsed:`
      );
      for (const issue of result.parseFailures.slice(0, 80)) {
        console.error(`      ${issue.file}: ${issue.reason}`);
      }
      if (result.parseFailures.length > 80) {
        console.error(`      ... ${result.parseFailures.length - 80} more omitted`);
      }
    }

    if (result.missing.length === 0) {
      console.log('   ✅ relative runtime imports are complete');
      if (result.unresolvedBare.length > 0) {
        console.log(`   ℹ️  ${result.unresolvedBare.length} bare import(s) were not resolved by the static checker`);
      }
      continue;
    }

    hasFailure = true;
    console.error(`   ❌ ${result.missing.length} missing relative runtime import(s):`);
    for (const issue of result.missing.slice(0, 80)) {
      console.error(`      ${issue.from} -> ${issue.specifier} (expected around ${issue.expected})`);
      if (issue.reason) console.error(`         ${issue.reason}`);
    }
    if (result.missing.length > 80) {
      console.error(`      ... ${result.missing.length - 80} more omitted`);
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`❌ Packaged runtime validation failed: ${error.message}`);
  process.exit(1);
}
