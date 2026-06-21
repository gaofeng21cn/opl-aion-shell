import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configPath = resolve(__dirname, '../../../packages/desktop/electron-builder.yml');

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
      'eventemitter3',
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
      'react',
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
});
