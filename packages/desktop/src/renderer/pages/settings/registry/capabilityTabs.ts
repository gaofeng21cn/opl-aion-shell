export type SettingsCapabilityDetailTab =
  | 'desktop'
  | 'opl_flow_managed'
  | 'manual_and_third_party'
  | 'image_voice'
  | 'packages';

const SETTINGS_CAPABILITY_DETAIL_TABS = new Set<string>([
  'desktop',
  'opl_flow_managed',
  'manual_and_third_party',
  'image_voice',
  'packages',
]);

export const normalizeCapabilityDetailTab = (value: string | null | undefined): SettingsCapabilityDetailTab | null => {
  if (value === 'computer-use' || value === 'opl-managed-companion') return 'desktop';
  if (value === 'voice-input' || value === 'image-generation') return 'image_voice';
  if (value === 'opl-flow-managed' || value === 'skills' || value === 'skills-hub') return 'opl_flow_managed';
  if (value === 'third-party' || value === 'tools' || value === 'assistants') {
    return 'manual_and_third_party';
  }
  return value && SETTINGS_CAPABILITY_DETAIL_TABS.has(value) ? (value as SettingsCapabilityDetailTab) : null;
};
