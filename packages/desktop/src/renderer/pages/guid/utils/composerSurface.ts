import {
  shouldShowOplCodexModelSelector,
  shouldShowOplHomePermissionModeSelector,
} from '@/common/config/oplProductProfile';
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
  return {
    executor: 'codex',
    active_shortcut_id: activeShortcut?.shortcut_id ?? null,
    active_package_id: activeShortcut?.package_id ?? null,
    model_reasoning_visible: shouldShowOplCodexModelSelector(),
    permission_access_visible: shouldShowOplHomePermissionModeSelector(),
    executor_selector_visible: false,
  };
}

export function getMissingOplHomeComposerControls(surface: OplHomeComposerSurface): string[] {
  const missing: string[] = [];
  if (!surface.model_reasoning_visible) missing.push('model_reasoning');
  if (!surface.permission_access_visible) missing.push('permission_access');
  if (surface.executor_selector_visible) missing.push('forbidden_executor_selector');
  return missing;
}
