export const SETTINGS_RETURN_STORAGE_KEY = 'aion:last-non-settings-path';
export const SETTINGS_RETURN_FALLBACK_PATH = '/guid';

type LocationParts = {
  pathname: string;
  search?: string;
  hash?: string;
};

function sessionStorageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isValidSettingsReturnPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  const hasControlCharacter = Array.from(value).some((character) => (character.codePointAt(0) ?? 0x20) < 0x20);
  if (value.includes('\\') || hasControlCharacter) return false;
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname !== '/settings' && !pathname.startsWith('/settings/');
}

export function rememberSettingsReturnPath(location: LocationParts, storage = sessionStorageOrNull()): string | null {
  const path = `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
  if (!storage || !isValidSettingsReturnPath(path)) return null;
  try {
    storage.setItem(SETTINGS_RETURN_STORAGE_KEY, path);
    return path;
  } catch {
    return null;
  }
}

export function resolveSettingsReturnPath(storage = sessionStorageOrNull()): string {
  if (!storage) return SETTINGS_RETURN_FALLBACK_PATH;
  try {
    const stored = storage.getItem(SETTINGS_RETURN_STORAGE_KEY);
    return isValidSettingsReturnPath(stored) ? stored : SETTINGS_RETURN_FALLBACK_PATH;
  } catch {
    return SETTINGS_RETURN_FALLBACK_PATH;
  }
}
