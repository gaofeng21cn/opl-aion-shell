import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseOplStandardAgentDirectoryEntries } from '@/common/types/opl/appState';
import { readRuntimeWorkItemProjectionV2 } from '@/renderer/pages/runtime/projection';
import { resolveOplHomeAssistants, resolveOplPackageLaunchGate } from '@/renderer/pages/guid/utils/oplHomeAssistants';

const APP_FIXTURE_ROOT = process.env.OPL_APP_ROOT?.trim() ?? '';
const APP_FIXTURE_REF = process.env.OPL_APP_FIXTURE_REF?.trim() || 'origin/main';
const FAST_FIXTURE = 'contracts/fixtures/opl-app-state-fast.fixture.json';
const MAS_RUNTIME_FIXTURE = 'contracts/fixtures/opl-app-state-runtime-v2-mas-detail.fixture.json';
const UNKNOWN_AGENT_FIXTURE = 'contracts/fixtures/opl-app-state-runtime-v2-unknown-agent.fixture.json';

function readCanonicalFixture(relativePath: string): Record<string, unknown> {
  if (!APP_FIXTURE_ROOT) throw new Error('OPL_APP_ROOT is required for the App-owned cross-fixture tests.');
  const bytes = execFileSync('git', ['-C', APP_FIXTURE_ROOT, 'show', `${APP_FIXTURE_REF}:${relativePath}`], {
    encoding: 'utf8',
  });
  const parsed: unknown = JSON.parse(bytes);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`App fixture ${relativePath} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

describe.skipIf(!APP_FIXTURE_ROOT)('Shell/App app-state cross-fixtures', () => {
  it('reads the App-owned fast directory ids and preserves package degradation', () => {
    const fixture = readCanonicalFixture(FAST_FIXTURE);
    const entries = parseOplStandardAgentDirectoryEntries(fixture);

    expect(entries.map((entry) => entry.packageId)).toEqual(['obf', 'oma', 'mas']);
    expect(entries.map((entry) => entry.installed)).toEqual([false, true, true]);

    expect(resolveOplPackageLaunchGate(fixture, 'obf')).toMatchObject({
      state: 'package_unavailable',
      launchAllowed: false,
      launchBlockedReason: 'package_not_installed',
    });
    expect(resolveOplPackageLaunchGate(fixture, 'oma')).toMatchObject({
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'scope_materialization_missing',
    });
    expect(resolveOplPackageLaunchGate(fixture, 'mas')).toMatchObject({
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'live_verification_deferred',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
  });

  it('does not infer a Runtime V2 payload from the fast App fixture', () => {
    const fixture = readCanonicalFixture(FAST_FIXTURE);

    expect(readRuntimeWorkItemProjectionV2(fixture)).toEqual({ state: 'missing', projection: null });
  });

  it('reads the App-owned MAS Runtime V2 descriptor without embedding domain payload', () => {
    const fixture = readCanonicalFixture(MAS_RUNTIME_FIXTURE);
    const result = readRuntimeWorkItemProjectionV2(fixture);

    expect(result.state).toBe('ready');
    expect(result.projection?.items).toHaveLength(1);
    expect(result.projection?.items[0]).toMatchObject({
      agentId: 'mas',
      domainDetailViews: [
        {
          viewId: 'research-roadmap',
          viewKind: 'research-roadmap',
          title: 'Research roadmap',
          schemaRef: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
          schemaVersion: null,
          availability: 'unread',
        },
      ],
    });
    expect(JSON.stringify(fixture)).not.toContain('medical_narrative');
    expect(JSON.stringify(fixture)).not.toContain('current_focus_node_refs');
  });

  it('discovers the unknown Agent and shortcut from a complete generic Runtime V2 fixture', () => {
    const fixture = readCanonicalFixture(UNKNOWN_AGENT_FIXTURE);
    const entries = parseOplStandardAgentDirectoryEntries(fixture);
    const assistants = resolveOplHomeAssistants([], fixture);
    const runtime = readRuntimeWorkItemProjectionV2(fixture);

    expect(entries.map((entry) => entry.packageId)).toEqual(['future.agent-lab']);
    expect(entries[0]?.homeShortcuts.map((shortcut) => shortcut.shortcutId)).toEqual(['future-main']);
    expect(
      assistants.map((assistant) => ({
        packageId: assistant.opl_package_id,
        shortcutId: assistant.opl_shortcut_id,
        label: assistant.name_i18n?.['en-US'],
      }))
    ).toEqual([
      {
        packageId: 'future.agent-lab',
        shortcutId: 'future-main',
        label: 'Start Future Research',
      },
    ]);
    expect(resolveOplPackageLaunchGate(fixture, 'future.agent-lab')).toMatchObject({
      state: 'ready',
      launchAllowed: true,
      launchBlockedReason: null,
    });
    expect(runtime.state).toBe('ready');
    expect(runtime.projection?.items).toEqual([
      expect.objectContaining({
        agentId: 'future.agent-lab',
        domainDetailViews: [
          expect.objectContaining({
            viewId: 'future-view',
            viewKind: 'future_agent_view',
            availability: 'unread',
          }),
        ],
      }),
    ]);
  });
});
