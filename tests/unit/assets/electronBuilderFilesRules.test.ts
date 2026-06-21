import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = resolve(__dirname, '../../../packages/desktop/electron-builder.yml');
const packagedRuntime = await import('../../../scripts/validate-packaged-runtime.js');

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
});
