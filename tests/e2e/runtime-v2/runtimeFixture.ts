import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeV2AppState } from '../../unit/opl-runtime/runtime-v2/fixture';

export type RuntimeE2EFixture = {
  app: ElectronApplication;
  page: Page;
  root: string;
  screenshotDir: string;
};

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFrameworkCarrier(root: string): { formulaBin: string; stateDir: string } {
  const packageRoot = path.join(root, 'formula-opl');
  const formulaBin = path.join(packageRoot, 'bin');
  const cliPath = path.join(packageRoot, 'dist', 'entrypoints', 'cli.js');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(formulaBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(formulaBin, 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
  fs.writeFileSync(
    cliPath,
    `process.stdout.write(${JSON.stringify(JSON.stringify(createRuntimeV2AppState()))});\n`,
    'utf8'
  );
  writeJson(path.join(packageRoot, 'package.json'), { name: 'opl-framework', version: '26.7.13-runtime-v2-e2e' });
  writeJson(path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json'), {
    version: 'p19.stage-runtime',
  });
  return { formulaBin, stateDir };
}

async function resolveMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => {
      const url = candidate.url();
      return url !== '' && url !== 'about:blank' && !url.startsWith('devtools://');
    });
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await app.waitForEvent('window', { timeout: 250 }).catch(() => null);
  }
  throw new Error('Runtime V2 E2E could not resolve the Electron renderer window.');
}

export async function launchRuntimeE2EFixture(): Promise<RuntimeE2EFixture> {
  const projectRoot = path.resolve(__dirname, '../../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-v2-e2e-'));
  const extensionRoot = path.join(root, 'extensions');
  const screenshotDir = path.join(projectRoot, 'tests', 'e2e', 'screenshots', 'runtime-v2');
  const { formulaBin, stateDir } = createFrameworkCarrier(root);
  fs.mkdirSync(extensionRoot, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      AIONUI_CDP_PORT: '0',
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_E2E_ALLOW_BACKEND_FAILURE: '1',
      AIONUI_E2E_TEST: '1',
      AIONUI_EXTENSIONS_PATH: extensionRoot,
      AIONUI_EXTENSION_STATES_FILE: path.join(root, 'extension-states.json'),
      OPL_APP_INSTALL_ORIGIN: 'homebrew_cask',
      OPL_HOMEBREW_FORMULA_BIN: formulaBin,
      OPL_STATE_DIR: stateDir,
    },
    timeout: 60_000,
  });

  return { app, page: await resolveMainWindow(app), root, screenshotDir };
}

export async function closeRuntimeE2EFixture(fixture: RuntimeE2EFixture | null): Promise<void> {
  if (!fixture) return;
  await fixture.app.close().catch(() => {});
  fs.rmSync(fixture.root, { recursive: true, force: true });
}
