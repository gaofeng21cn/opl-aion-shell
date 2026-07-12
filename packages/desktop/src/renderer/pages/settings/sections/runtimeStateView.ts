/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type RuntimeModuleItem = Record<string, unknown>;
export type RuntimeStatusTone = 'green' | 'orange';
export type Translate = (key: string, options?: Record<string, string | number>) => string;

const OPL_MODULE_DISPLAY_LABELS: Record<string, string> = {
  'med-autoscience': 'Med Auto Science',
  'med-autogrant': 'Med Auto Grant',
  redcubeai: 'RedCube AI',
  'redcube-ai': 'RedCube AI',
  oplmetaagent: 'OPL Meta Agent',
  oplbookforge: 'OPL Book Forge',
  mag: 'Med Auto Grant',
  mas: 'Med Auto Science',
  medautoscience: 'Med Auto Science',
  medautogrant: 'Med Auto Grant',
  oma: 'OPL Meta Agent',
  oplflow: 'OPL Flow',
  redcube: 'RedCube AI',
  rca: 'RedCube AI',
};

const DEVELOPER_MODULE_SOURCES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

export function normalizeStatus(status: string | undefined | null): string | null {
  if (!status) return null;
  if (status === 'attention_needed' || status === 'needs_attention') return 'attention_required';
  return status;
}

export function formatStatus(status: string | undefined | null, t: Translate): string {
  const normalized = normalizeStatus(status);
  if (!normalized) return t('settings.oplEnvironmentPage.status.unknown');
  return t(`settings.oplEnvironmentPage.status.${normalized}`, { status: normalized });
}

export function oplPathString(value: unknown): string | null {
  return oplString(value) ?? oplString(oplRecord(value).selected_path);
}

export function normalizeModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function moduleId(module: RuntimeModuleItem): string {
  const rawId =
    oplString(module.module_id) ??
    oplString(module.id) ??
    oplString(module.name)
      ?.replace(/[^a-z0-9]/gi, '')
      .toLowerCase() ??
    '';
  return normalizeModuleId(rawId);
}

export function moduleDisplayLabel(module: RuntimeModuleItem): string {
  const id = moduleId(module);
  return OPL_MODULE_DISPLAY_LABELS[id] ?? oplString(module.display_name) ?? oplString(module.label) ?? id;
}

export function normalizeModule(module: RuntimeModuleItem): RuntimeModuleItem {
  const id = moduleId(module);
  return {
    ...module,
    module_id: id,
    label: moduleDisplayLabel(module),
  };
}

export function moduleRecords(value: unknown): RuntimeModuleItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  return Object.entries(record).map(([id, module]) => Object.assign({}, oplRecord(module), { module_id: id }));
}

export function moduleStatus(module: RuntimeModuleItem): string {
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

export function moduleSource(module: RuntimeModuleItem): string | null {
  const sourcePolicy = oplRecord(module.source_policy);
  return (
    oplString(module.source) ??
    oplString(module.install_origin) ??
    oplString(module.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

export function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function moduleNeedsManualHandling(module: RuntimeModuleItem): boolean {
  const status = moduleStatus(module);
  const source = moduleSource(module);
  const git = oplRecord(module.git);
  return (
    status === 'dirty' ||
    status === 'manual_required' ||
    status === 'skipped_manual_required' ||
    Boolean(source && DEVELOPER_MODULE_SOURCES.has(source)) ||
    isTruthyFlag(module.manual_required) ||
    isTruthyFlag(module.checkout_dirty) ||
    isTruthyFlag(module.working_tree_dirty) ||
    isTruthyFlag(git.dirty)
  );
}

export function moduleHasLocalChanges(module: RuntimeModuleItem): boolean {
  const status = moduleStatus(module);
  const git = oplRecord(module.git);
  return (
    status === 'dirty' ||
    isTruthyFlag(module.checkout_dirty) ||
    isTruthyFlag(module.working_tree_dirty) ||
    isTruthyFlag(git.dirty)
  );
}

export function isReadyStatus(status: string): boolean {
  return status === 'ready' || status === 'compatible' || status === 'ok' || status === 'installed';
}

export function moduleInstalled(module: RuntimeModuleItem): boolean {
  if (module.installed === false) return false;
  if (module.installed === true) return true;
  return [
    'ready',
    'current',
    'dirty',
    'update_available',
    'manual_required',
    'skipped_manual_required',
    'compatible',
    'ok',
    'installed',
  ].includes(moduleStatus(module));
}

export function modulePath(module: RuntimeModuleItem): string {
  return (
    oplString(module.path) ??
    oplString(module.checkout_path) ??
    oplString(module.managed_checkout_path) ??
    oplString(module.repo_url) ??
    ''
  );
}

export function moduleVersionDetail(module: RuntimeModuleItem, t: Translate): string {
  const parts = [
    oplString(module.version),
    oplString(module.source),
    oplString(module.install_origin),
    oplString(oplRecord(module.git).short_sha),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(' · ');
  return moduleId(module) || t('settings.oplEnvironmentPage.status.unknown');
}

export function modulePathSource(
  module: RuntimeModuleItem,
  familyWorkspaceRoot: string | null,
  modulesSource: string | null,
  t: Translate
): string {
  const source = oplString(module.source) ?? oplString(module.install_origin) ?? modulesSource ?? 'unknown';
  const modulePathValue = modulePath(module);
  if (familyWorkspaceRoot && modulePathValue.startsWith(familyWorkspaceRoot)) {
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot', {
      root: familyWorkspaceRoot,
    });
  }
  if (source === 'sibling_workspace')
    return t('settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace');
  if (source === 'env_override') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.envOverride');
  if (source === 'managed_root') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.managedRoot');
  if (source === 'missing') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.missing');
  if (source === 'invalid_checkout') return t('settings.oplEnvironmentPage.moduleVersion.pathSources.invalidCheckout');
  return t('settings.oplEnvironmentPage.moduleVersion.pathSources.unknown');
}

export function formatModuleAction(action: string, t: Translate): string {
  return t(`settings.oplEnvironmentPage.moduleActions.${action}`, { action });
}

export function moduleManualHandlingLabel(module: RuntimeModuleItem, t: Translate): string {
  const source = moduleSource(module);
  if (moduleHasLocalChanges(module)) {
    return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.dirtyCheckout');
  }
  if (source && DEVELOPER_MODULE_SOURCES.has(source)) {
    return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.developerCheckout');
  }
  return t('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.manualRequired');
}
