import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createRuntimeV2AppState,
  createScientificReasoningViewResponse,
} from '../../unit/opl-runtime/runtime-v2/fixture';

const APP_STATE_FILE = 'runtime-v2-app-state.json';
const ACTION_LOG_FILE = 'runtime-v2-action-log.jsonl';
const DOMAIN_VIEW_FILE = 'runtime-v2-domain-view.json';

export type RuntimeE2EAppState = ReturnType<typeof createRuntimeV2AppState>;

export type RuntimeE2EActionLogEntry = {
  outcome: 'applied' | 'generation_conflict' | 'not_found' | 'invalid_payload';
  action_id: string;
  payload: Record<string, unknown>;
  item_id: string | null;
  previous_generation: number | null;
  resulting_generation: number | null;
};

export type RuntimeE2EFixture = {
  app: ElectronApplication;
  page: Page;
  root: string;
  screenshotDir: string;
  cliPath: string;
  stateDir: string;
};

export type RuntimeE2ELocale = 'zh-CN' | 'en-US';

export type RuntimeE2ELaunchTarget = {
  args: string[];
  cwd: string;
  executablePath?: string;
};

/** Builds a source or packaged Electron target without mixing their entry arguments. */
export function buildRuntimeE2ELaunchTarget(input: {
  projectRoot: string;
  locale: RuntimeE2ELocale;
  userDataDir: string;
}): RuntimeE2ELaunchTarget {
  const commonArgs = [`--lang=${input.locale}`, `--user-data-dir=${input.userDataDir}`];
  const executablePath = process.env.OPL_RUNTIME_E2E_EXECUTABLE_PATH?.trim();
  return executablePath
    ? { args: commonArgs, cwd: input.projectRoot, executablePath }
    : { args: ['.', ...commonArgs], cwd: input.projectRoot };
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createRuntimeE2EAppState(): RuntimeE2EAppState {
  const state = createRuntimeV2AppState();
  const projection = state.app_state.operator.workbench.work_item_projection_v2;

  // Stage display names are package-owned. Keep only the current machine id and
  // the explicit next state so the renderer proves both Stage Map lookup paths.
  for (const item of projection.items) {
    if (item.execution.current_stage_id) {
      item.execution.current_stage_display_name = null;
      item.lifecycle.current_stage_display_name = null;
    }
    item.execution.next_stage_id = null;
    item.execution.next_stage_display_name = null;
  }
  return state;
}

function fakeOplCarrierSource(): string {
  return `
const fs = require('node:fs');
const path = require('node:path');

const APP_STATE_FILE = ${JSON.stringify(APP_STATE_FILE)};
const ACTION_LOG_FILE = ${JSON.stringify(ACTION_LOG_FILE)};
const DOMAIN_VIEW_FILE = ${JSON.stringify(DOMAIN_VIEW_FILE)};
const CONFLICT_REASON = 'work_item_control_generation_conflict';
const CONFLICT_MESSAGE = 'Work item control changed after it was read; refresh before retrying.';
const stateDir = process.env.OPL_STATE_DIR;
if (!stateDir) throw new Error('OPL_STATE_DIR is required by the Runtime E2E carrier.');
const statePath = path.join(stateDir, APP_STATE_FILE);
const actionLogPath = path.join(stateDir, ACTION_LOG_FILE);
const domainViewPath = path.join(stateDir, DOMAIN_VIEW_FILE);
const args = process.argv.slice(2);

function emit(value) {
  process.stdout.write(JSON.stringify(value));
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(value) {
  const temporaryPath = statePath + '.tmp-' + process.pid;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\\n', 'utf8');
  fs.renameSync(temporaryPath, statePath);
}

function appendAction(entry) {
  fs.appendFileSync(actionLogPath, JSON.stringify(entry) + '\\n', 'utf8');
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function projectionFrom(state) {
  return state.app_state.operator.workbench.work_item_projection_v2;
}

function refreshSummary(projection) {
  const visibleItems = projection.items.filter((item) => item.visibility.state === 'visible');
  projection.summary.work_item_count = visibleItems.length;
  projection.summary.visible_work_item_count = visibleItems.length;
  projection.summary.archived_work_item_count = projection.items.length - visibleItems.length;
  projection.summary.total_work_item_count = projection.items.length;
  projection.summary.running_count = visibleItems.filter((item) => item.execution.state === 'running').length;
  projection.summary.user_attention_count = visibleItems.filter((item) => item.attention.kind === 'user').length;
  projection.summary.system_attention_count = visibleItems.filter((item) => item.attention.kind === 'system').length;
  projection.summary.telemetry_observed_count = visibleItems.filter(
    (item) => item.telemetry.cumulative.state === 'observed'
  ).length;
  projection.summary.telemetry_missing_count = visibleItems.filter(
    (item) => item.telemetry.cumulative.state === 'missing'
  ).length;
}

if (args[0] === 'app' && args[1] === 'state') {
  emit(readState());
} else if (args[0] === 'app' && args[1] === 'view' && args[2] === 'read') {
  const itemId = option('--item-id');
  const viewId = option('--view-id');
  const ifRevision = option('--if-revision');
  const view = JSON.parse(fs.readFileSync(domainViewPath, 'utf8'));
  if (itemId !== view.item_id || viewId !== view.view_id) {
    emit({ ...view, item_id: itemId || '', view_id: viewId || '', availability: 'missing', payload: null });
  } else if (ifRevision !== undefined && Number(ifRevision) === view.revision) {
    emit({ ...view, not_modified: true, payload: null });
  } else {
    emit(view);
  }
} else if (args[0] === 'runtime' && args[1] === 'app-operator-drilldown') {
  emit({ app_operator_drilldown: { runtime_workbench: {} } });
} else if (args[0] === 'app' && args[1] === 'action' && args[2] === 'execute') {
  const actionId = option('--action');
  const rawPayload = option('--payload');
  let payload = {};
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch (error) {
    appendAction({
      outcome: 'invalid_payload',
      action_id: actionId || '',
      payload: {},
      item_id: null,
      previous_generation: null,
      resulting_generation: null,
    });
    emit({ ok: false, reason_code: 'work_item_visibility_payload_invalid' });
    process.exit(0);
  }

  if (actionId !== 'work_item_visibility_set') {
    emit({ ok: false, reason_code: 'unsupported_runtime_e2e_action' });
    process.exit(0);
  }

  const state = readState();
  const projection = projectionFrom(state);
  const item = projection.items.find(
    (candidate) =>
      candidate.identity.agent_id === payload.agent_id &&
      candidate.identity.project_id === payload.project_id &&
      candidate.identity.work_item_id === payload.work_item_id
  );
  if (!item) {
    appendAction({
      outcome: 'not_found',
      action_id: actionId,
      payload,
      item_id: null,
      previous_generation: null,
      resulting_generation: null,
    });
    emit({ ok: false, reason_code: 'work_item_not_found' });
    process.exit(0);
  }

  const currentGeneration = Number.isInteger(item.visibility.generation) ? item.visibility.generation : 0;
  if (
    payload.expected_generation !== undefined &&
    (!Number.isInteger(payload.expected_generation) || payload.expected_generation !== currentGeneration)
  ) {
    appendAction({
      outcome: 'generation_conflict',
      action_id: actionId,
      payload,
      item_id: item.item_id,
      previous_generation: currentGeneration,
      resulting_generation: currentGeneration,
    });
    emit({
      ok: false,
      reason_code: CONFLICT_REASON,
      error: {
        message: CONFLICT_MESSAGE,
        reason_code: CONFLICT_REASON,
        details: {
          reason_code: CONFLICT_REASON,
          expected_generation: payload.expected_generation,
          current_generation: currentGeneration,
        },
      },
    });
    process.exit(0);
  }

  if (!['visible', 'archived'].includes(payload.visibility_state)) {
    appendAction({
      outcome: 'invalid_payload',
      action_id: actionId,
      payload,
      item_id: item.item_id,
      previous_generation: currentGeneration,
      resulting_generation: currentGeneration,
    });
    emit({ ok: false, reason_code: 'work_item_visibility_state_invalid' });
    process.exit(0);
  }

  const nextGeneration = currentGeneration + 1;
  item.visibility = {
    ...item.visibility,
    state: payload.visibility_state,
    source: 'work_item_visibility_control',
    updated_at: new Date().toISOString(),
    control_ref:
      'visibility-control://' +
      encodeURIComponent(payload.agent_id) +
      '/' +
      encodeURIComponent(payload.project_id) +
      '/' +
      encodeURIComponent(payload.work_item_id),
    generation: nextGeneration,
  };
  projection.generated_at = new Date().toISOString();
  refreshSummary(projection);
  writeState(state);
  appendAction({
    outcome: 'applied',
    action_id: actionId,
    payload,
    item_id: item.item_id,
    previous_generation: currentGeneration,
    resulting_generation: nextGeneration,
  });
  emit({
    ok: true,
    action_id: actionId,
    item_id: item.item_id,
    visibility: item.visibility,
  });
} else {
  emit({ ok: false, reason_code: 'unsupported_runtime_e2e_command', args });
}
`;
}

function createFrameworkCarrier(root: string): { formulaBin: string; stateDir: string; cliPath: string } {
  const packageRoot = path.join(root, 'formula-opl');
  const formulaBin = path.join(packageRoot, 'bin');
  const cliPath = path.join(packageRoot, 'dist', 'entrypoints', 'cli.js');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(formulaBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(formulaBin, 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
  fs.writeFileSync(cliPath, fakeOplCarrierSource(), 'utf8');
  writeJson(path.join(stateDir, APP_STATE_FILE), createRuntimeE2EAppState());
  writeJson(path.join(stateDir, DOMAIN_VIEW_FILE), createScientificReasoningViewResponse());
  fs.writeFileSync(path.join(stateDir, ACTION_LOG_FILE), '', 'utf8');
  writeJson(path.join(packageRoot, 'package.json'), { name: 'opl-framework', version: '26.7.14-runtime-v2-e2e' });
  writeJson(path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json'), {
    version: 'p19.stage-runtime',
  });
  return { formulaBin, stateDir, cliPath };
}

function parseCarrierOutput(stdout: string): Record<string, unknown> {
  const parsed = JSON.parse(stdout) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Runtime E2E carrier returned a non-object payload.');
  }
  return parsed as Record<string, unknown>;
}

export function executeRuntimeE2EVisibilityAction(
  fixture: RuntimeE2EFixture,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const result = spawnSync(
    process.execPath,
    [
      fixture.cliPath,
      'app',
      'action',
      'execute',
      '--action',
      'work_item_visibility_set',
      '--payload',
      JSON.stringify(payload),
      '--json',
    ],
    {
      cwd: fixture.root,
      env: { ...process.env, OPL_STATE_DIR: fixture.stateDir },
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    throw new Error(`Runtime E2E carrier failed (${result.status}): ${result.stderr}`);
  }
  return parseCarrierOutput(result.stdout);
}

export function readRuntimeE2EAppState(fixture: RuntimeE2EFixture): RuntimeE2EAppState {
  return JSON.parse(fs.readFileSync(path.join(fixture.stateDir, APP_STATE_FILE), 'utf8')) as RuntimeE2EAppState;
}

export function readRuntimeE2EActionLog(fixture: RuntimeE2EFixture): RuntimeE2EActionLogEntry[] {
  return fs
    .readFileSync(path.join(fixture.stateDir, ACTION_LOG_FILE), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RuntimeE2EActionLogEntry);
}

/** Replaces the fake Framework detail view while preserving the carrier boundary. */
export function writeRuntimeE2EDomainView(
  fixture: RuntimeE2EFixture,
  options: Parameters<typeof createScientificReasoningViewResponse>[0]
): void {
  writeJson(path.join(fixture.stateDir, DOMAIN_VIEW_FILE), createScientificReasoningViewResponse(options));
}

async function resolveMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 60_000;
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
  const windowUrls = app.windows().map((candidate) => candidate.url());
  throw new Error(`Runtime V2 E2E could not resolve the Electron renderer window. URLs: ${JSON.stringify(windowUrls)}`);
}

export async function launchRuntimeE2EFixture(options: { locale?: RuntimeE2ELocale } = {}): Promise<RuntimeE2EFixture> {
  const projectRoot = path.resolve(__dirname, '../../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-v2-e2e-'));
  const locale = options.locale ?? 'zh-CN';
  const extensionRoot = path.join(root, 'extensions');
  const userDataDir = path.join(root, 'user-data');
  const devUserDataDir = path.join(root, 'OnePersonLab-Dev');
  const screenshotDir = path.join(projectRoot, 'tests', 'e2e', 'screenshots', 'runtime-v2');
  const { formulaBin, stateDir, cliPath } = createFrameworkCarrier(root);
  fs.mkdirSync(extensionRoot, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(devUserDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  const launchTarget = buildRuntimeE2ELaunchTarget({ projectRoot, locale, userDataDir });
  const app = await electron.launch({
    ...launchTarget,
    env: {
      ...process.env,
      NODE_ENV: launchTarget.executablePath ? 'production' : 'development',
      AIONUI_CDP_PORT: '0',
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_E2E_ALLOW_BACKEND_FAILURE: '1',
      AIONUI_E2E_TEST: '1',
      AIONUI_E2E_STORAGE_ROOT: root,
      AIONUI_EXTENSIONS_PATH: extensionRoot,
      AIONUI_EXTENSION_STATES_FILE: path.join(root, 'extension-states.json'),
      OPL_APP_INSTALL_ORIGIN: 'homebrew_cask',
      OPL_HOMEBREW_FORMULA_BIN: formulaBin,
      OPL_STATE_DIR: stateDir,
    },
    timeout: 60_000,
  });
  const output: string[] = [];
  const captureOutput = (chunk: Buffer | string) => output.push(String(chunk));
  app.process().stdout?.on('data', captureOutput);
  app.process().stderr?.on('data', captureOutput);
  try {
    if (launchTarget.executablePath) {
      const actualExecutablePath = await app.evaluate(({ app: electronApp }) => electronApp.getPath('exe'));
      if (path.resolve(actualExecutablePath) !== path.resolve(launchTarget.executablePath)) {
        throw new Error(
          `Runtime V2 E2E launched unexpected executable: ${actualExecutablePath} (expected ${launchTarget.executablePath})`
        );
      }
    }
    const page = await resolveMainWindow(app);
    return { app, page, root, screenshotDir, cliPath, stateDir };
  } catch (error) {
    await app.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nElectron output:\n${output.join('').slice(-20_000)}`);
  } finally {
    app.process().stdout?.off('data', captureOutput);
    app.process().stderr?.off('data', captureOutput);
  }
}

export async function closeRuntimeE2EFixture(fixture: RuntimeE2EFixture | null): Promise<void> {
  if (!fixture) return;
  await fixture.app.close().catch(() => {});
  fs.rmSync(fixture.root, { recursive: true, force: true });
}
