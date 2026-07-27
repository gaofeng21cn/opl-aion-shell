import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = resolve(__dirname, '../../../packages/desktop/electron-builder.yml');
const packagedRuntime = await import('../../../scripts/validate-packaged-runtime.js');
const runtimeMaterializer = await import('../../../scripts/materialize-packaged-runtime-dependencies.js');
const requireFromHere = createRequire(import.meta.url);

function readRules(): string[] {
  return readFileSync(configPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));
}

function hasPositiveRule(rules: string[], packageName: string): boolean {
  return rules.some((rule) => rule === `- node_modules/${packageName}/**/*`);
}

function hasNegativeRule(rules: string[], packageName: string): boolean {
  return rules.some((rule) => {
    if (!rule.startsWith("- '!")) return false;
    if (rule.includes(`node_modules/${packageName}/**`)) return true;

    const groups = rule.matchAll(/\{([^}]+)\}/g);
    for (const group of groups) {
      const tokens = group[1].split(',').map((token) => token.trim());
      if (tokens.includes(packageName)) return true;
    }

    return false;
  });
}

function resolvePackageJson(packageName: string): string | null {
  try {
    return requireFromHere.resolve(`${packageName}/package.json`);
  } catch (_) {
    // Some packages intentionally do not export package.json. Fall back to the
    // physical package symlink under root node_modules, which is what builder
    // rules package.
  }

  const physicalPath = resolve(__dirname, '../../../node_modules', packageName, 'package.json');
  return existsSync(physicalPath) ? realpathSync(physicalPath) : null;
}

function runtimeDependencyClosure(rootPackages: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...rootPackages];

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (!packageName || seen.has(packageName)) continue;
    seen.add(packageName);
    const packageJsonPath = resolvePackageJson(packageName);
    expect(packageJsonPath, `${packageName} package.json must be resolvable`).toBeTruthy();
    const packageJson = JSON.parse(readFileSync(packageJsonPath as string, 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(packageJson.dependencies ?? {});
    const peerDependencies =
      packageName === '@office-ai/platform' ? Object.keys(packageJson.peerDependencies ?? {}) : [];
    for (const dependencyName of [...dependencies, ...peerDependencies]) {
      if (!seen.has(dependencyName)) queue.push(dependencyName);
    }
  }

  return [...seen].sort();
}

describe('electron-builder files rules', () => {
  it('keeps main-process runtime dependencies explicitly included', () => {
    const rules = readRules();

    for (const packageName of [
      'better-sqlite3',
      'electron-log',
      'electron-updater',
      'electron-squirrel-startup',
      '@sentry/electron',
      '@office-ai/platform',
      'serve-handler',
      'semver',
      'i18next',
      'asynckit',
      'axios',
      'call-bind-apply-helpers',
      'combined-stream',
      'delayed-stream',
      'dunder-proto',
      'es-define-property',
      'es-errors',
      'es-object-atoms',
      'es-set-tostringtag',
      'eventemitter3',
      'follow-redirects',
      'form-data',
      'function-bind',
      'get-intrinsic',
      'get-proto',
      'gopd',
      'has-symbols',
      'has-tostringtag',
      'hasown',
      'math-intrinsics',
      'mime-db',
      'mime-types',
      'proxy-from-env',
      'react',
      'rxjs',
      'tslib',
    ]) {
      expect(hasPositiveRule(rules, packageName), `${packageName} should be included for main runtime`).toBe(true);
      expect(hasNegativeRule(rules, packageName), `${packageName} must not be excluded`).toBe(false);
    }
  });

  it('excludes renderer-only and self-contained MCP build dependencies from app.asar node_modules', () => {
    const rules = readRules();

    for (const packageName of [
      '@arco-design',
      '@codemirror',
      '@monaco-editor',
      '@uiw',
      'react-dom',
      'react-markdown',
      'streamdown',
      'mermaid',
      'diff2html',
      '@anthropic-ai',
      '@aws-sdk',
      '@google',
      'openai',
      'docx',
      'mammoth',
      'xlsx-republish',
      '@agentclientprotocol',
      '@modelcontextprotocol',
      'zod',
      '@office-ai/aioncli-core',
    ]) {
      expect(hasNegativeRule(rules, packageName), `${packageName} should be excluded from app.asar`).toBe(true);
    }
  });

  it('validates required main-process runtime packages in packaged app.asar resources', () => {
    const root = resolve(tmpdir(), `opl-main-runtime-${process.pid}-${Date.now()}`);
    const resourcesRoot = resolve(root, 'Contents', 'Resources');
    const appAsarRoot = resolve(resourcesRoot, 'app.asar');
    try {
      for (const packageName of packagedRuntime.REQUIRED_MAIN_PROCESS_RUNTIME_PACKAGES) {
        const packageJsonPath = resolve(appAsarRoot, packagedRuntime.packageJsonRelativePath(packageName));
        mkdirSync(resolve(packageJsonPath, '..'), { recursive: true });
        writeFileSync(packageJsonPath, `${JSON.stringify({ name: packageName })}\n`);
      }

      expect(packagedRuntime.validateMainProcessRuntimeDependencies(resourcesRoot)).toMatchObject({
        checked: true,
        issues: [],
      });

      rmSync(resolve(appAsarRoot, 'node_modules', 'react'), { recursive: true, force: true });
      expect(packagedRuntime.validateMainProcessRuntimeDependencies(resourcesRoot).issues).toContain(
        'packaged app.asar is missing main-process runtime dependency node_modules/react/package.json'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps packaged runtime validator aligned with @office-ai/platform runtime dependency closure', () => {
    expect([...packagedRuntime.REQUIRED_MAIN_PROCESS_RUNTIME_PACKAGES].sort()).toEqual(
      runtimeDependencyClosure(['@office-ai/platform'])
    );
  });

  it('materializes linked runtime packages for builder traversal and restores the links', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'opl-runtime-materializer-'));
    const target = resolve(root, 'store', 'axios');
    const linkedPackage = resolve(root, 'node_modules', 'axios');
    mkdirSync(target, { recursive: true });
    mkdirSync(resolve(linkedPackage, '..'), { recursive: true });
    writeFileSync(resolve(target, 'package.json'), `${JSON.stringify({ name: 'axios' })}\n`);
    writeFileSync(resolve(target, 'index.js'), 'module.exports = true;\n');
    symlinkSync(target, linkedPackage, process.platform === 'win32' ? 'junction' : 'dir');

    try {
      const materialization = runtimeMaterializer.materializePackagedRuntimeDependencies(root, ['axios']);
      expect(materialization.materialized).toEqual(['axios']);
      expect(lstatSync(linkedPackage).isSymbolicLink()).toBe(false);
      expect(readFileSync(resolve(linkedPackage, 'index.js'), 'utf8')).toContain('module.exports');

      materialization.restore();
      expect(lstatSync(linkedPackage).isSymbolicLink()).toBe(true);
      expect(realpathSync(linkedPackage)).toBe(realpathSync(target));
      materialization.restore();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores earlier links when materialization fails partway through', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'opl-runtime-materializer-rollback-'));
    const target = resolve(root, 'store', 'axios');
    const linkedPackage = resolve(root, 'node_modules', 'axios');
    mkdirSync(target, { recursive: true });
    mkdirSync(resolve(linkedPackage, '..'), { recursive: true });
    writeFileSync(resolve(target, 'package.json'), `${JSON.stringify({ name: 'axios' })}\n`);
    symlinkSync(target, linkedPackage, process.platform === 'win32' ? 'junction' : 'dir');

    try {
      expect(() =>
        runtimeMaterializer.materializePackagedRuntimeDependencies(root, ['axios', 'missing-package'])
      ).toThrow('Packaged runtime dependency is not installed: missing-package');
      expect(lstatSync(linkedPackage).isSymbolicLink()).toBe(true);
      expect(realpathSync(linkedPackage)).toBe(realpathSync(target));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
