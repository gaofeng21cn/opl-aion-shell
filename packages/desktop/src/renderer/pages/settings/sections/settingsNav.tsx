export {
  BUILTIN_TAB_IDS,
  LEGACY_ANCHOR_REMAP,
  LEGACY_SETTINGS_ANCHOR_REMAP,
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  SETTINGS_ROUTE_PATHS,
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
  getSettingsSearchEntries,
  getSettingsTabIcon,
  getSearchableSecondarySettingsModalItems,
  getSettingsTabSearchText,
  resolveLegacySettingsRoute,
} from '../registry/settingsRegistry';
export type {
  BuiltinSettingsTabId,
  SettingsNavItem,
  SettingsSearchEntry,
  TranslateFn,
} from '../registry/settingsRegistry';
