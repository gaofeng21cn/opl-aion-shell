/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { CreateAssistantRequest } from '@/common/types/agent/assistantTypes';
import { promises as fs } from 'fs';
import path from 'path';
import { getAssistantsDir, type ProcessConfig as ProcessConfigType } from './initStorage';

const BUILTIN_ID_PREFIX = 'builtin-';

/**
 * Legacy filename pattern for custom assistant rule files written by the
 * pre-backend Electron build into `<userData>/config/assistants/`.
 *   - Rules: `<id>.<locale>.md`
 *   - Skills (kept here for completeness, not migrated by this module yet):
 *     `<id>-skills.<locale>.md`
 *
 * We intentionally migrate only rule files: the renderer's "edit assistant"
 * drawer always writes the rule (the prompt) but the skills md was a
 * deprecated freeform extra prompt — there is no UI surface that reads it
 * now that skills are looked up via the skills hub.
 */
const RULE_FILE_RE = /^(.+?)\.([a-zA-Z-]+)\.md$/;

/**
 * The legacy Electron build shipped `'gemini'` as the fallback agent type for
 * every assistant (built-in and user). The current backend ships `'aionrs'` as
 * the built-in default — the internal Gemini engine was removed, and what
 * remains with the name "gemini" is a distinct ACP backend the user must
 * install. Treat the legacy default as "no explicit choice" and promote it to
 * the current default, so users who never touched the agent picker don't find
 * all their assistants pointing at a backend that is no longer there on boot.
 * Users who *explicitly* picked `'codex' / 'claude' / 'qwen' / …` keep their
 * choice by resolving the legacy backend label to the current management id.
 */
const LEGACY_DEFAULT_PRESET_AGENT_TYPE = 'gemini';
const CURRENT_DEFAULT_PRESET_AGENT_TYPE = 'aionrs';

/**
 * Normalise a legacy `presetAgentType` for migration. Absent / non-string /
 * the legacy default → current default. Everything else is preserved verbatim.
 */
function normalisePresetAgentType(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw === LEGACY_DEFAULT_PRESET_AGENT_TYPE) {
    return CURRENT_DEFAULT_PRESET_AGENT_TYPE;
  }
  return raw;
}

/**
 * Frozen snapshot of built-in assistant ids. Must stay in sync with the
 * backend manifest at
 * `AionCore/crates/aionui-app/assets/builtin-assistants/preset-id-whitelist.json`
 * — add/remove ids in the same PR. Drift means a user-authored assistant
 * whose id accidentally matches a built-in slug will be imported into the
 * user table and then silently overwritten the next time the backend ships
 * a matching built-in. The legacy `builtin-` prefix check handles the common
 * case; this whitelist is the guard for unprefixed ids.
 */
const PRESET_ID_WHITELIST = new Set<string>([
  'word-creator',
  'word-form-creator',
  'ppt-creator',
  'excel-creator',
  'morph-ppt',
  'morph-ppt-3d',
  'pitch-deck-creator',
  'dashboard-creator',
  'academic-paper',
  'financial-model-creator',
  'star-office-helper',
  'openclaw-setup',
  'cowork',
  'game-3d',
  'ui-ux-pro-max',
  'planning-with-files',
  'human-3-coach',
  'social-job-publisher',
  'moltbook',
  'beautiful-mermaid',
  'story-roleplay',
]);

function isLegacyBuiltin(a: Record<string, unknown>): boolean {
  const id = typeof a.id === 'string' ? a.id : '';
  return id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
}

function generateCollisionId(): string {
  const ms = Date.now();
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `custom-migrated-${ms}-${hex}`;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArrayRecord(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === 'string');
      if (arr.length > 0) out[k] = arr;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((x): x is string => typeof x === 'string');
  return arr.length > 0 ? arr : undefined;
}

/**
 * Adapt a legacy assistant row from the Electron config file (previously
 * typed as the legacy `AcpBackendConfig` shape) into the backend `CreateAssistantRequest`
 * contract. Drops CLI-specific fields (cliCommand, defaultCliPath, acpArgs,
 * env) and the redundant isPreset/isBuiltin flags.
 *
 * Exported so the mapper can be unit-tested in isolation. Legacy input keeps
 * its historical camelCase shape; output matches the backend snake_case wire
 * contract.
 */
export function legacyAssistantToCreateRequest(
  legacy: Record<string, unknown>,
  runtimeAgentIds: ReadonlyMap<string, string> = new Map()
): CreateAssistantRequest {
  const legacyId = typeof legacy.id === 'string' ? legacy.id : '';

  // Rename colliding user-authored ids to preserve data (spec §8.1).
  const id = PRESET_ID_WHITELIST.has(legacyId) ? generateCollisionId() : legacyId;

  const name = typeof legacy.name === 'string' && legacy.name.trim().length > 0 ? legacy.name : 'Untitled';
  const description = typeof legacy.description === 'string' ? legacy.description : undefined;
  const avatar = typeof legacy.avatar === 'string' ? legacy.avatar : undefined;
  const agent_id = runtimeAgentIds.get(normalisePresetAgentType(legacy.presetAgentType));

  return {
    id,
    name,
    description,
    avatar,
    agent_id,
    enabled_skills: asStringArray(legacy.enabledSkills),
    custom_skill_names: asStringArray(legacy.customSkillNames),
    disabled_builtin_skills: asStringArray(legacy.disabledBuiltinSkills),
    prompts: asStringArray(legacy.prompts),
    models: asStringArray(legacy.models),
    name_i18n: asStringRecord(legacy.nameI18n),
    description_i18n: asStringRecord(legacy.descriptionI18n),
    prompts_i18n: asStringArrayRecord(legacy.promptsI18n),
  };
}

type ConfigFile = typeof ProcessConfigType;

type BuiltinOverride = { id: string; enabled: false };
type AssistantAgentIdOverride = { id: string; agent_id: string };
type ManagedAgentIdentity = { id: string; agent_type: string; backend?: string };

/**
 * Local config file key that records "the legacy → backend assistant migration
 * has already completed once on this machine". Same idempotency rationale as
 * `migration.providersMigrated_v1` (see ELECTRON-1KT): without it, a user-deleted
 * assistant would be silently re-imported on every launch from the still-on-disk
 * legacy `assistants` field (kept on purpose so the user can downgrade).
 */
const ASSISTANTS_MIGRATION_FLAG = 'migration.assistantsMigrated_v1';
const ASSISTANT_IMPORT_COMPLETED_FLAG = 'migration.assistantImportCompleted_v1';
const ASSISTANT_AGENT_IDS_MIGRATION_FLAG = 'migration.assistantAgentIdsMigrated_v2';

type LegacyConfigAccessor = {
  get: (key: string) => Promise<unknown>;
  set?: (key: string, value: unknown) => Promise<unknown>;
};

async function readMigrationFlag(accessor: LegacyConfigAccessor, key: string): Promise<boolean> {
  try {
    return Boolean(await accessor.get(key));
  } catch {
    return false;
  }
}

async function markMigrationDone(configFile: ConfigFile, key: string): Promise<boolean> {
  const accessor = configFile as unknown as LegacyConfigAccessor;
  if (typeof accessor.set !== 'function') {
    console.warn('[AionUi] cannot persist assistants migration flag: config setter unavailable');
    return false;
  }
  try {
    await accessor.set(key, true);
    return true;
  } catch (err) {
    console.warn('[AionUi] failed to persist assistants migration flag', err);
    return false;
  }
}

async function markAssistantsMigrationDone(configFile: ConfigFile): Promise<boolean> {
  return markMigrationDone(configFile, ASSISTANTS_MIGRATION_FLAG);
}

async function markAssistantImportCompleted(configFile: ConfigFile): Promise<boolean> {
  return markMigrationDone(configFile, ASSISTANT_IMPORT_COMPLETED_FLAG);
}

async function markAssistantAgentIdsMigrationDone(configFile: ConfigFile): Promise<boolean> {
  return markMigrationDone(configFile, ASSISTANT_AGENT_IDS_MIGRATION_FLAG);
}

export function buildRuntimeAgentIdMap(agents: ManagedAgentIdentity[]): Map<string, string> {
  const ids = new Map<string, string>();
  const idsByRuntime = new Map<string, string[]>();
  for (const agent of agents) {
    ids.set(agent.id, agent.id);
    const runtimeKey = agent.backend || agent.agent_type;
    const matches = idsByRuntime.get(runtimeKey) ?? [];
    matches.push(agent.id);
    idsByRuntime.set(runtimeKey, matches);
  }
  for (const [runtimeKey, matches] of idsByRuntime) {
    if (matches.length === 1 && !ids.has(runtimeKey)) ids.set(runtimeKey, matches[0]);
  }
  return ids;
}

async function fetchRuntimeAgentIds(): Promise<Map<string, string> | null> {
  try {
    return buildRuntimeAgentIdMap(await ipcBridge.acpConversation.getManagedAgents.invoke());
  } catch (error) {
    console.error('[AionUi] Failed to fetch managed agent identities for assistant migration:', error);
    return null;
  }
}

/**
 * Collect user-set `enabled=false` overrides on legacy built-in rows so we can
 * replay them against the backend's `assistant_overrides` table post-import.
 *
 * Legacy frontend ids carry a `builtin-` prefix (e.g. `builtin-word-creator`)
 * but the backend manifest uses bare slugs (`word-creator`). Strip the prefix
 * before emitting; leave unprefixed whitelist hits as-is.
 */
function collectBuiltinOverrides(legacy: Record<string, unknown>[]): BuiltinOverride[] {
  const overrides: BuiltinOverride[] = [];
  for (const row of legacy) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const isBuiltin = id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
    if (!isBuiltin) continue;
    if (row.enabled !== false) continue;
    const backendId = id.startsWith(BUILTIN_ID_PREFIX) ? id.slice(BUILTIN_ID_PREFIX.length) : id;
    overrides.push({ id: backendId, enabled: false });
  }
  return overrides;
}

/**
 * Replay disabled-state overrides onto the backend's `assistant_overrides`
 * table via PATCH /api/assistants/{id}/state. Returns the count of failures
 * so the caller can keep the migration flag false and retry on next launch.
 * Runs in parallel because each upsert is independent and the set is small
 * (single-digit count in practice).
 *
 * 404 is treated as "skip, not failure" — the legacy row references a built-in
 * id that the current backend manifest no longer ships (e.g. `pdf-to-ppt`,
 * `pptx-generator` were retired). The user's disabled preference is moot
 * because the assistant itself is gone. Counting these as failures would keep
 * the overall migration flag false and trap the user in an endless retry loop
 * on every launch.
 */
async function applyBuiltinOverrides(overrides: BuiltinOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(
    overrides.map((ov) => ipcBridge.assistants.setState.invoke({ id: ov.id, enabled: ov.enabled }))
  );
  let failed = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason;
      if (isBackendHttpError(reason) && reason.status === 404) {
        skipped += 1;
        console.warn(
          `[AionUi] Skipped override for retired built-in '${overrides[i].id}' (no longer in backend manifest)`
        );
        return;
      }
      failed += 1;
      console.error(`[AionUi] Failed to apply builtin override for ${overrides[i].id}:`, reason);
    }
  });
  const applied = overrides.length - failed - skipped;
  if (failed === 0) {
    console.log(`[AionUi] Applied ${applied} builtin disabled-state override(s) (skipped ${skipped} retired id(s))`);
  } else {
    console.error(
      `[AionUi] Builtin override partial: ${failed}/${overrides.length} failed, ${skipped} skipped, ${applied} applied`
    );
  }
  return failed;
}

function collectBuiltinAgentIdOverrides(
  legacy: Record<string, unknown>[],
  currentBuiltinAgentIds: Map<string, string>,
  runtimeAgentIds: ReadonlyMap<string, string>
): AssistantAgentIdOverride[] {
  const overrides: AssistantAgentIdOverride[] = [];
  for (const row of legacy) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const isBuiltin = id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
    if (!isBuiltin) continue;

    const raw = row.presetAgentType;
    if (typeof raw !== 'string' || raw.length === 0 || raw === LEGACY_DEFAULT_PRESET_AGENT_TYPE) {
      continue;
    }

    const backendId = id.startsWith(BUILTIN_ID_PREFIX) ? id.slice(BUILTIN_ID_PREFIX.length) : id;
    const current = currentBuiltinAgentIds.get(backendId);
    if (current === undefined) {
      continue;
    }
    const agent_id = runtimeAgentIds.get(raw);
    if (!agent_id || current === agent_id) continue;

    overrides.push({ id: backendId, agent_id });
  }
  return overrides;
}

function collectUserAssistantAgentIdOverrides(
  legacy: Record<string, unknown>[],
  runtimeAgentIds: ReadonlyMap<string, string>
): AssistantAgentIdOverride[] {
  const overrides: AssistantAgentIdOverride[] = [];
  for (const row of legacy) {
    if (isLegacyBuiltin(row)) continue;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const agent_id = runtimeAgentIds.get(normalisePresetAgentType(row.presetAgentType));
    if (agent_id) overrides.push({ id, agent_id });
  }
  return overrides;
}

async function applyAssistantAgentIdOverrides(overrides: AssistantAgentIdOverride[]): Promise<number> {
  if (overrides.length === 0) return 0;
  const results = await Promise.allSettled(overrides.map((override) => ipcBridge.assistants.update.invoke(override)));
  let failed = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const reason = r.reason;
      if (isBackendHttpError(reason) && reason.status === 404) {
        skipped += 1;
        console.warn(`[AionUi] Skipped agent_id repair for missing assistant '${overrides[i].id}'`);
        return;
      }
      failed += 1;
      console.error(`[AionUi] Failed to apply agent_id repair for ${overrides[i].id}:`, reason);
    }
  });
  const applied = overrides.length - failed - skipped;
  if (failed === 0) {
    console.log(`[AionUi] Applied ${applied} assistant agent_id repair(s) (skipped ${skipped} missing id(s))`);
  } else {
    console.error(
      `[AionUi] Assistant agent_id repair partial: ${failed}/${overrides.length} failed, ${skipped} skipped, ${applied} applied`
    );
  }
  return failed;
}

async function fetchCurrentBuiltinAgentIds(): Promise<Map<string, string> | null> {
  try {
    const list = await ipcBridge.assistants.list.invoke();
    const map = new Map<string, string>();
    for (const a of list) {
      if (a.source !== 'builtin') continue;
      if (a.agent_id) map.set(a.id, a.agent_id);
    }
    return map;
  } catch (error) {
    console.error('[AionUi] Failed to fetch current builtin agent_id map:', error);
    return null;
  }
}

/**
 * Phase 4: upload custom-assistant rule .md files from the legacy on-disk
 * directory to the backend. The pre-backend build wrote these as
 * `<userData>/config/assistants/<id>.<locale>.md`. The new home is
 * `<dataDir>/assistant-rules/<id>.<locale>.md`, owned by the backend, and
 * only the backend's `POST /api/skills/assistant-rule/write` is allowed to
 * touch it.
 *
 * Idempotency follows the sibling-migration pattern (see
 * `configMigration.ts`): every launch re-runs cheaply, but for each rule
 * file we first probe the backend via `readAssistantRule`. If the backend
 * already has non-empty content, we skip the write so the user's
 * post-migration edits are never clobbered. Empty / missing on the backend
 * → upload.
 *
 * Skipped ids:
 *   - Built-in ids (`builtin-*` or whitelisted slug). The backend rejects
 *     writes against built-in ids on purpose, and built-in rule files
 *     ship inside the backend's resource bundle anyway.
 *   - Skill files (`<id>-skills.<locale>.md`) — those are a deprecated
 *     extra prompt with no UI surface left.
 *   - Files whose id is not present in the legacy `assistants` array —
 *     protects against stale .md files referring to assistants the user
 *     has since deleted.
 *
 * Returns the number of failures; 0 means the phase succeeded (no files
 * present is also success). Any failure logs a warning but does not abort
 * the rest of the migration — the next launch retries.
 */
async function uploadLegacyAssistantRules(legacyAssistantIds: Set<string>): Promise<number> {
  const dir = getAssistantsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // No legacy assistants dir at all — nothing to upload.
      return 0;
    }
    console.error('[AionUi] Failed to read legacy assistant rules dir:', error);
    return 1;
  }

  const ruleEntries: Array<{ file: string; id: string; locale: string }> = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    if (file.includes('-skills.')) continue;
    const match = RULE_FILE_RE.exec(file);
    if (!match) continue;
    const id = match[1];
    const locale = match[2];
    if (id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id)) continue;
    if (!legacyAssistantIds.has(id)) continue;
    ruleEntries.push({ file, id, locale });
  }

  if (ruleEntries.length === 0) return 0;

  type Outcome = 'uploaded' | 'skipped';
  const results = await Promise.allSettled(
    ruleEntries.map(async ({ file, id, locale }): Promise<Outcome> => {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      if (!content.trim()) return 'skipped';
      // Read-before-write: skip if the backend already has non-empty
      // content for this (id, locale) so the user's post-migration
      // edits are never clobbered. Treat read failures as "no content"
      // so a freshly-imported assistant still receives its legacy rule.
      const existing = await ipcBridge.fs.readAssistantRule.invoke({ assistant_id: id, locale }).catch(() => '');
      if (existing.trim().length > 0) return 'skipped';
      await ipcBridge.fs.writeAssistantRule.invoke({ assistant_id: id, locale, content });
      return 'uploaded';
    })
  );

  let failed = 0;
  let uploaded = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed += 1;
      console.error(
        `[AionUi] Failed to upload legacy rule for '${ruleEntries[i].id}' (${ruleEntries[i].locale}):`,
        r.reason
      );
      return;
    }
    if (r.value === 'uploaded') uploaded += 1;
    else skipped += 1;
  });
  if (failed === 0) {
    if (uploaded > 0 || skipped > 0) {
      console.log(`[AionUi] Legacy rule upload: ${uploaded} uploaded, ${skipped} skipped`);
    }
  } else {
    console.error(`[AionUi] Legacy rule upload partial: ${failed}/${ruleEntries.length} failed`);
  }
  return failed;
}

/**
 * Import legacy `ConfigStorage.get('assistants')` into the backend after the
 * backend is healthy. Four phases:
 *
 *   1. POST /api/assistants/import for user-authored rows (insert-only, so
 *      already-migrated rows are skipped without clobber).
 *   2. PATCH /api/assistants/{id}/state for each legacy built-in that the
 *      user had disabled, so the `enabled=false` preference survives the
 *      migration to the backend's `assistant_overrides` table.
 *   3. PUT /api/assistants/{id} to replace legacy backend labels with the
 *      stable managed-agent row ids required by the current backend. This
 *      repairs both user assistants and built-in overrides left by v1.
 *   4. POST /api/skills/assistant-rule/write for each `<userData>/config/
 *      assistants/<id>.<locale>.md` belonging to a custom assistant — but
 *      only when the backend rule for that (id, locale) is currently empty,
 *      so post-migration edits are never overwritten.
 *
 * The import boundary is persisted immediately after Phase 1, before later
 * repair phases run. Separate overall-completion and v2 agent-id flags keep
 * the migration restartable without re-importing assistants the user later
 * deletes. The legacy `assistants` field is never touched, so downgrading to
 * an older Electron build still works.
 *
 * Returns `true` when all phases complete cleanly. A failure returns
 * `false` so the caller can log the partial state, but next launch
 * naturally retries the remaining work.
 *
 * Honors `AIONUI_SKIP_ELECTRON_MIGRATION=1` so E2E fixtures can seed via
 * `POST /api/assistants/import` directly.
 */
export async function migrateAssistantsToBackend(configFile: ConfigFile): Promise<boolean> {
  if (process.env.AIONUI_SKIP_ELECTRON_MIGRATION === '1') {
    console.log('[AionUi] Assistant migration skipped (env flag set)');
    return false;
  }

  const rawConfigFile = configFile as unknown as LegacyConfigAccessor;

  const [alreadyMigrated, importCompleted, agentIdsMigrated] = await Promise.all([
    readMigrationFlag(rawConfigFile, ASSISTANTS_MIGRATION_FLAG),
    readMigrationFlag(rawConfigFile, ASSISTANT_IMPORT_COMPLETED_FLAG),
    readMigrationFlag(rawConfigFile, ASSISTANT_AGENT_IDS_MIGRATION_FLAG),
  ]);
  if (alreadyMigrated && agentIdsMigrated) {
    return true;
  }

  const legacyValue = await rawConfigFile.get('assistants').catch(() => [] as unknown);
  const legacy = (Array.isArray(legacyValue) ? legacyValue : []) as Record<string, unknown>[];

  const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));
  const builtinDisabledOverrides = collectBuiltinOverrides(legacy);
  const [runtimeAgentIds, currentBuiltinAgentIds] = await Promise.all([
    fetchRuntimeAgentIds(),
    fetchCurrentBuiltinAgentIds(),
  ]);
  if (!runtimeAgentIds || !currentBuiltinAgentIds) return false;
  const builtinAgentIdOverrides = collectBuiltinAgentIdOverrides(legacy, currentBuiltinAgentIds, runtimeAgentIds);
  const userAgentIdOverrides = collectUserAssistantAgentIdOverrides(legacy, runtimeAgentIds);

  // Phase 4 keys off the *legacy* custom-assistant id (the file name on
  // disk). The collision-rename path in `legacyAssistantToCreateRequest`
  // produces a fresh id for rows whose legacy id clashed with a built-in
  // slug, but those collisions are extremely rare in practice and are
  // not handled here: the rule would be uploaded under the legacy id and
  // would not match the new row. Acceptable trade-off for now.
  const customAssistantIds = new Set<string>(
    legacy
      .filter((a) => !isLegacyBuiltin(a))
      .map((a) => (typeof a.id === 'string' ? a.id : ''))
      .filter((id) => id.length > 0)
  );

  if (
    userAssistants.length === 0 &&
    builtinDisabledOverrides.length === 0 &&
    builtinAgentIdOverrides.length === 0 &&
    userAgentIdOverrides.length === 0 &&
    customAssistantIds.size === 0
  ) {
    // Nothing to do — no-op success. Flag it so future launches don't even
    // bother reading the legacy field.
    const flagsPersisted = await Promise.all([
      markAssistantImportCompleted(configFile),
      markAssistantsMigrationDone(configFile),
      markAssistantAgentIdsMigrationDone(configFile),
    ]);
    return flagsPersisted.every(Boolean);
  }

  // Phase 1: import user-authored assistants (if any).
  if (!alreadyMigrated && !importCompleted) {
    if (userAssistants.length > 0) {
      try {
        const result = await ipcBridge.assistants.import.invoke({
          assistants: userAssistants.map((assistant) => legacyAssistantToCreateRequest(assistant, runtimeAgentIds)),
        });
        if (result.failed !== 0) {
          console.error(`[AionUi] Assistant migration partial: ${result.failed} failed`, result.errors);
          return false;
        }
        if (result.imported > 0 || result.skipped > 0) {
          console.log(`[AionUi] migrated ${result.imported} assistants (skipped ${result.skipped})`);
        }
      } catch (error) {
        console.error('[AionUi] Assistant migration failed:', error);
        return false;
      }
    }
    // Persist the import boundary before any later repair phase. Otherwise a
    // later failure can cause the next launch to re-import an Assistant that
    // the user deleted after the first successful import.
    if (!(await markAssistantImportCompleted(configFile))) {
      return false;
    }
  }

  // Phase 2: replay disabled-state overrides for built-ins.
  const disabledOverrideFailures = alreadyMigrated ? 0 : await applyBuiltinOverrides(builtinDisabledOverrides);
  if (disabledOverrideFailures > 0) {
    // Partial override failure — retry on next launch. setState is an upsert
    // on the backend side, so replaying is safe.
    return false;
  }

  // Phase 3: bind legacy backend labels to the stable management-row ids that
  // AionCore v0.1.44 accepts. This also repairs machines where v1 completed
  // while the old `preset_agent_type` field was silently ignored.
  const agentIdOverrideFailures = await applyAssistantAgentIdOverrides([
    ...userAgentIdOverrides,
    ...builtinAgentIdOverrides,
  ]);
  if (agentIdOverrideFailures > 0) {
    return false;
  }

  // Phase 4: upload legacy custom-assistant rule files.
  const ruleUploadFailures = alreadyMigrated ? 0 : await uploadLegacyAssistantRules(customAssistantIds);
  if (ruleUploadFailures > 0) {
    return false;
  }

  // All four phases succeeded — set the completion flag so subsequent launches
  // short-circuit and we don't re-import assistants the user deletes later.
  const flagsPersisted = await Promise.all([
    markAssistantImportCompleted(configFile),
    markAssistantsMigrationDone(configFile),
    markAssistantAgentIdsMigrationDone(configFile),
  ]);
  return flagsPersisted.every(Boolean);
}
