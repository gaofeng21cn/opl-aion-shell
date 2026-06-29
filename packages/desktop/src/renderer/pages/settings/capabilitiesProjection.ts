/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOplAssistantSkillProfile,
  getOplDefaultHomeAssistants,
  type OplHomeAssistant,
} from '@/common/config/oplProductProfile';
import type { OplAppStateRecord } from '@/common/types/opl/appState';
import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type CapabilityStatus = 'ready' | 'update' | 'repair' | 'missing';

export type CapabilityCodexVisibility = 'visible' | 'needsSync' | 'notVisible' | 'unknown';

export type CapabilityPurposeViewModel = {
  key: string;
  title: string;
  description: string;
  tags: string[];
  moduleIds: string[];
  status: CapabilityStatus;
  codexVisibility: CapabilityCodexVisibility;
  version: string | null;
  source: string | null;
  lastSync: string | null;
  failureReason: string | null;
};

export type ExtraCapabilityPurposeInput = Omit<
  CapabilityPurposeViewModel,
  'status' | 'codexVisibility' | 'version' | 'source' | 'lastSync' | 'failureReason'
>;

type RuntimeModuleItem = OplAppStateRecord;

const ASSISTANT_MODULE_ALIASES: Record<string, string[]> = {
  mas: ['medautoscience', 'med-auto-science'],
  mag: ['medautogrant', 'med-auto-grant'],
  rca: ['redcube', 'redcubeai', 'redcube-ai'],
  bookforge: ['oplbookforge', 'opl-bookforge'],
  oma: ['oplmetaagent', 'opl-meta-agent'],
};

function normalizeCapabilityModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function capabilityModuleId(module: RuntimeModuleItem): string {
  return normalizeCapabilityModuleId(
    oplString(module.module_id) ??
      oplString(module.id) ??
      oplString(module.name) ??
      oplString(module.display_name) ??
      ''
  );
}

function capabilityModuleRecords(value: unknown): RuntimeModuleItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  return Object.entries(record)
    .filter(([, module]) => Object.keys(oplRecord(module)).length > 0)
    .map(([id, module]) => Object.assign({}, oplRecord(module), { module_id: id }));
}

function capabilityModuleStatus(module: RuntimeModuleItem | undefined): string {
  if (!module) return 'not_configured';
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function mapCapabilityStatus(module: RuntimeModuleItem | undefined): CapabilityStatus {
  const status = capabilityModuleStatus(module);
  const action = oplString(module?.recommended_action);
  if (!module || ['missing', 'not_installed', 'notInstalled', 'not_configured'].includes(status)) return 'missing';
  if (['update', 'install', 'reinstall'].includes(action ?? '') || ['update_available', 'staged'].includes(status)) {
    return 'update';
  }
  if (
    [
      'dirty',
      'manual_required',
      'skipped_manual_required',
      'failed',
      'failed_with_repair',
      'degraded',
      'blocking',
      'attention_required',
      'unknown',
    ].includes(status)
  ) {
    return 'repair';
  }
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(status)) return 'ready';
  return 'repair';
}

function capabilityCodexVisibility(
  module: RuntimeModuleItem | undefined,
  status: CapabilityStatus
): CapabilityCodexVisibility {
  if (!module) return 'notVisible';
  const exposure = oplRecord(module.capability_exposure);
  const codexVisible =
    module.codex_visible ??
    module.visible_to_codex ??
    module.exposed_to_codex ??
    exposure.codex_visible ??
    exposure.visible_to_codex ??
    exposure.exposed;
  const exposureStatus = oplString(exposure.status) ?? oplString(module.exposure_status);
  if (codexVisible === true || exposureStatus === 'visible' || exposureStatus === 'ready') return 'visible';
  if (status === 'ready') return 'visible';
  if (status === 'update' || exposureStatus === 'stale' || exposureStatus === 'needs_sync') return 'needsSync';
  if (status === 'missing') return 'notVisible';
  return 'unknown';
}

function capabilityVersion(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const git = oplRecord(module.git);
  return (
    oplString(module.version) ??
    oplString(module.package_version) ??
    oplString(module.installed_version) ??
    oplString(git.short_sha)
  );
}

function capabilitySource(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const sourcePolicy = oplRecord(module.source_policy);
  return (
    oplString(module.source) ??
    oplString(module.install_origin) ??
    oplString(module.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

function capabilityLastSync(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const exposure = oplRecord(module.capability_exposure);
  return (
    oplString(module.last_sync_at) ??
    oplString(module.synced_at) ??
    oplString(module.updated_at) ??
    oplString(exposure.last_sync_at) ??
    oplString(exposure.synced_at)
  );
}

function capabilityFailureReason(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const error = oplRecord(module.error);
  const exposure = oplRecord(module.capability_exposure);
  return (
    oplString(module.failure_reason) ??
    oplString(module.last_failure) ??
    oplString(module.reason) ??
    oplString(error.message) ??
    oplString(exposure.failure_reason) ??
    oplString(exposure.last_failure)
  );
}

function buildCapabilityPurpose(
  purpose: Omit<
    CapabilityPurposeViewModel,
    'status' | 'codexVisibility' | 'version' | 'source' | 'lastSync' | 'failureReason'
  >,
  module: RuntimeModuleItem | undefined
): CapabilityPurposeViewModel {
  const status = mapCapabilityStatus(module);
  return {
    ...purpose,
    status,
    codexVisibility: capabilityCodexVisibility(module, status),
    version: capabilityVersion(module),
    source: capabilitySource(module),
    lastSync: capabilityLastSync(module),
    failureReason: capabilityFailureReason(module),
  };
}

function assistantModuleIds(assistant: OplHomeAssistant): string[] {
  const profile = getOplAssistantSkillProfile(assistant.id);
  const ids = [
    assistant.id,
    assistant.short_name,
    ...(profile?.required_skills ?? []),
    ...(ASSISTANT_MODULE_ALIASES[assistant.id] ?? []),
  ];
  return [...new Set(ids.map(normalizeCapabilityModuleId).filter(Boolean))];
}

function assistantTags(assistant: OplHomeAssistant): string[] {
  const profile = getOplAssistantSkillProfile(assistant.id);
  return [...new Set([assistant.short_name, ...(profile?.required_skills ?? [])].filter(Boolean))];
}

export function buildCapabilitiesViewModel(
  appState: OplAppStateRecord,
  localeKey: string,
  extraPurposes: ExtraCapabilityPurposeInput[] = []
): CapabilityPurposeViewModel[] {
  const modulesPayload = oplRecord(appState.modules);
  const modules = new Map<string, RuntimeModuleItem>();
  for (const module of capabilityModuleRecords(modulesPayload.items ?? modulesPayload.modules ?? modulesPayload)) {
    modules.set(capabilityModuleId(module), module);
  }

  const defaultPurposes = getOplDefaultHomeAssistants().map((assistant) => {
    const moduleIds = assistantModuleIds(assistant);
    const module = moduleIds.map((id) => modules.get(id)).find(Boolean);
    return buildCapabilityPurpose(
      {
        key: assistant.id,
        title: assistant.home_purpose_label,
        description:
          assistant.description_i18n[localeKey] ?? assistant.description_i18n['en-US'] ?? assistant.display_name,
        tags: assistantTags(assistant),
        moduleIds,
      },
      module
    );
  });
  const explicitPurposes = extraPurposes.map((purpose) => {
    const module = purpose.moduleIds.map((id) => modules.get(normalizeCapabilityModuleId(id))).find(Boolean);
    return buildCapabilityPurpose(
      {
        ...purpose,
        moduleIds: purpose.moduleIds.map(normalizeCapabilityModuleId),
      },
      module
    );
  });
  return [...defaultPurposes, ...explicitPurposes];
}
