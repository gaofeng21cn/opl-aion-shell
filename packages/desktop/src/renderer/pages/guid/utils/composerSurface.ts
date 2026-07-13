import { getOplHomeComposerStateContract } from '@/common/config/oplProductProfile';
import type { OplActiveShortcut } from './activeShortcut';

export type OplHomeComposerSurface = {
  executor: 'codex';
  active_shortcut_id: string | null;
  active_package_id: string | null;
  model_reasoning_visible: boolean;
  permission_access_visible: boolean;
  executor_selector_visible: false;
};

export function resolveOplHomeComposerSurface(activeShortcut: OplActiveShortcut | null): OplHomeComposerSurface {
  const contract = getOplHomeComposerStateContract();
  return {
    executor: contract.executor,
    active_shortcut_id: activeShortcut?.shortcut_id ?? null,
    active_package_id: activeShortcut?.package_id ?? null,
    model_reasoning_visible: contract.invariants.model_reasoning_visible,
    permission_access_visible: contract.invariants.permission_access_visible,
    executor_selector_visible: contract.invariants.executor_selector_visible,
  };
}

export function getMissingOplHomeComposerControls(surface: OplHomeComposerSurface): string[] {
  const missing: string[] = [];
  if (!surface.model_reasoning_visible) missing.push('model_reasoning');
  if (!surface.permission_access_visible) missing.push('permission_access');
  if (surface.executor_selector_visible) missing.push('forbidden_executor_selector');
  return missing;
}
