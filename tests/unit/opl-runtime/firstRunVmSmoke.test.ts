import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
const { __test } = await import('../../../scripts/opl-first-run-vm-smoke.mjs');

describe('packaged first-run VM smoke helpers', () => {
  it('launches packaged apps with CDP and renderer accessibility enabled', () => {
    expect(__test.buildLaunchAppArgs('/Applications/One Person Lab.app', { cdpPort: 9239 })).toEqual([
      '-n',
      '/Applications/One Person Lab.app',
      '--args',
      '--force-renderer-accessibility',
      '--aionui-cdp-port=9239',
    ]);
  });

  it('filters stale first-run events by timestamp', () => {
    expect(__test.eventTimestampMs({ timestamp: '2026-05-27T07:00:01.000Z' })).toBe(
      Date.parse('2026-05-27T07:00:01.000Z')
    );
    expect(__test.eventTimestampMs({ timestamp: 'not-a-date' })).toBe(0);
  });

  it('accepts already-prepared first-run events from the current launch', () => {
    expect(
      __test.isFirstRunCompletionEvent({
        event_type: 'gui_preparation_skipped',
        payload: { status: 'already-prepared' },
      })
    ).toBe(true);
    expect(
      __test.isFirstRunCompletionEvent({
        event_type: 'gui_preparation_skipped',
        payload: { status: 'blocked' },
      })
    ).toBe(false);
  });

  it('uses the existing-install Guid probe only outside clean first-run gates', () => {
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: false,
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: true,
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: false,
        requireCodexConfigWizard: true,
      })
    ).toBe(false);
    expect(__test.existingStateGuidProbeTimeoutMs({ timeoutMs: 240_000 })).toBe(30_000);
    expect(__test.existingStateGuidProbeTimeoutMs({ timeoutMs: 5_000 })).toBe(5_000);
  });

  it('caps CDP probing and keeps Accessibility fallback inside the shared timeout budget', () => {
    expect(__test.cdpProbeTimeoutMs({ timeoutMs: 240_000 })).toBe(30_000);
    expect(__test.cdpProbeTimeoutMs({ timeoutMs: 5_000 })).toBe(5_000);
    expect(__test.remainingGuidFallbackTimeoutMs(180_000, 30_000)).toBe(150_000);
    expect(__test.remainingGuidFallbackTimeoutMs(180_000, 181_000)).toBe(0);
  });

  it('writes JSONL smoke events without leaking secrets', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-smoke-events-'));
    try {
      const writeSmokeEvent = __test.createSmokeEventWriter(artifacts, 'sk-test-secret');
      writeSmokeEvent('wait_guid_cdp', 'started', { cdp_port: 9230 });
      writeSmokeEvent('wait_guid_cdp', 'passed', { duration_ms: 12 });

      const lines = fs.readFileSync(path.join(artifacts, 'smoke-events.jsonl'), 'utf8').trim().split(/\r?\n/);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({
        phase: 'wait_guid_cdp',
        status: 'started',
        cdp_port: 9230,
      });
      expect(JSON.parse(lines[1])).toMatchObject({
        phase: 'wait_guid_cdp',
        status: 'passed',
        duration_ms: 12,
      });
      expect(() => writeSmokeEvent('summary', 'failed', { error: 'sk-test-secret' })).toThrow(/Codex API key/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('checks the usable Guid entry through DOM state rather than macOS accessibility only', () => {
    const expression = __test.guidEntryReadinessExpression();

    expect(expression).toContain('[data-testid="opl-guid-entry"]');
    expect(expression).toContain('[data-testid="guid-input"]');
    expect(expression).toContain("window.location.hash.startsWith('#/guid')");
    expect(expression).toContain('[data-testid="opl-first-run-window"]');
  });

  it('navigates through the ready entry button instead of forcing the /guid route', () => {
    const expression = __test.guidEntryNavigationExpression();

    expect(expression).toContain('[aria-label="opl-first-run-ready-entry"]');
    expect(expression).toContain('readyButton.click()');
    expect(expression).toContain("navigatedBy: 'ready_entry'");
    expect(expression).not.toContain("window.location.hash = '#/guid'");
  });

  it('smokes the current OPL App-owned settings routes', () => {
    const targetHashes = __test.SETTINGS_PAGE_SMOKE_TARGETS.map((target) => target.hash);

    expect(targetHashes).toEqual([
      '#/settings/overview',
      '#/settings/runtime',
      '#/settings/capabilities',
      '#/settings/access',
      '#/settings/appearance',
      '#/settings/system',
      '#/settings/about',
    ]);
    expect(targetHashes).not.toContain('#/settings/model');
    expect(targetHashes).not.toContain('#/settings/agent');
    expect(targetHashes).not.toContain('#/settings/display');
    expect(targetHashes).not.toContain('#/settings/webui');
  });

  it('checks the read-only Developer Mode status instead of toggling a removed switch', () => {
    const expression = __test.developerModeStatusExpression();

    expect(expression).toContain('[data-testid="opl-developer-mode-row"]');
    expect(expression).toContain('[data-testid="opl-developer-mode-status"]');
    expect(expression).toContain('OPL 开发者模式');
    expect(expression).toContain('OPL Developer Mode row exposed machine status');
    expect(expression).not.toContain('opl-developer-mode-switch');
    expect(expression).not.toContain('.click()');
  });

  it('summarizes live system initialize readiness as the first-run proof source', () => {
    const summary = __test.summarizeCoreFirstLaunch(
      JSON.stringify({
        system_initialize: {
          setup_flow: {
            ready_to_launch: true,
            blocking_items: [],
          },
          readiness: {
            launch_ready: true,
            core_ready: true,
          },
        },
      })
    );

    expect(summary).toEqual({
      source: 'opl system initialize --json',
      status: 'ready',
      ready_to_launch: true,
      blocking_items: [],
      readiness: {
        launch_ready: true,
        core_ready: true,
      },
    });
  });

  it('allows deferred Full readiness blockers after Core launch is ready', () => {
    const summary = __test.summarizeCoreFirstLaunch(
      JSON.stringify({
        system_initialize: {
          setup_flow: {
            blocking_items: ['domain_modules', 'family_runtime_provider', 'recommended_skills'],
          },
          readiness: {
            launch_ready: true,
            core_ready: true,
            domain_ready: true,
          },
        },
      })
    );

    expect(summary.status).toBe('ready');
    expect(summary.blocking_items).toEqual(['domain_modules', 'family_runtime_provider', 'recommended_skills']);
  });
});
