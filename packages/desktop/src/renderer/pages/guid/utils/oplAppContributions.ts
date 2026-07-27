import type {
  OplAppContributionBadge,
  OplAppContributionCommand,
  OplAppContributionNavigation,
  OplAppContributions,
  OplAppContributionView,
  OplAppContributionViewType,
  OplPackageAppContributions,
} from '@/common/types/opl/appState';

const VIEW_TYPES = new Set<OplAppContributionViewType>([
  'list_detail',
  'timeline',
  'approval_diff',
  'task_board',
  'artifact_view',
  'activity_log',
]);
const BADGE_TONES = new Set(['neutral', 'info', 'success', 'warning', 'critical']);
const FORBIDDEN_FIELDS = new Set([
  'component',
  'code',
  'path',
  'url',
  'react',
  'electron',
  'html',
  'javascript',
  'js',
]);
const ROOT_FIELDS = new Set(['schema_version', 'navigation', 'views', 'commands', 'badges']);
const NAVIGATION_FIELDS = new Set(['navigation_id', 'label_i18n', 'view_id', 'icon_id', 'sort_order']);
const VIEW_FIELDS = new Set([
  'view_id',
  'view_type',
  'title_i18n',
  'data_ref',
  'command_ids',
  'badge_ids',
  'empty_state_i18n',
]);
const COMMAND_FIELDS = new Set(['command_id', 'label_i18n', 'action_ref', 'confirmation_required']);
const STABLE_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const STABLE_REF =
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/;
const MAX_ITEMS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableId(value: unknown): string | null {
  const normalized = nonBlankString(value);
  return normalized && normalized.length <= 128 && STABLE_ID.test(normalized) ? normalized : null;
}

function stableRef(value: unknown): string | null {
  const normalized = nonBlankString(value);
  return normalized && normalized.length <= 257 && STABLE_REF.test(normalized) ? normalized : null;
}

function hasOnlyFields(value: Record<string, unknown>, fields: Set<string>): boolean {
  return Object.keys(value).every((field) => fields.has(field));
}

function hasForbiddenField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenField);
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).some((field) => FORBIDDEN_FIELDS.has(field.toLowerCase())) ||
    Object.values(value).some(hasForbiddenField)
  );
}

function localizedStrings(value: unknown): Partial<Record<'zh-CN' | 'en-US', string>> | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null;
  const entries = Object.entries(value).flatMap(([locale, text]) => {
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale)) return [];
    const normalized = nonBlankString(text);
    return normalized && normalized.length <= 2000 ? [[locale, normalized]] : [];
  });
  return entries.length === Object.keys(value).length ? Object.fromEntries(entries) : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const strings = value.map(stableId);
  if (strings.some((entry) => entry === null)) return null;
  return new Set(strings).size === strings.length ? (strings as string[]) : null;
}

function parseOptionalString(value: unknown): string | null | undefined {
  return value === undefined ? undefined : nonBlankString(value);
}

function parseNavigation(value: unknown): OplAppContributionNavigation | null {
  if (!isRecord(value) || !hasOnlyFields(value, NAVIGATION_FIELDS)) return null;
  const navigationId = stableId(value.navigation_id);
  const labelI18n = localizedStrings(value.label_i18n);
  const viewId = stableId(value.view_id);
  const iconId = value.icon_id === undefined ? undefined : stableId(value.icon_id);
  const sortOrder = value.sort_order;
  if (
    !navigationId ||
    !labelI18n ||
    !viewId ||
    iconId === null ||
    (sortOrder !== undefined &&
      (typeof sortOrder !== 'number' ||
        !Number.isInteger(sortOrder) ||
        sortOrder < -10000 ||
        sortOrder > 10000))
  ) {
    return null;
  }
  return {
    navigationId,
    labelI18n,
    viewId,
    ...(iconId === undefined ? {} : { iconId }),
    ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
  };
}

function parseView(value: unknown): OplAppContributionView | null {
  if (!isRecord(value) || !hasOnlyFields(value, VIEW_FIELDS)) return null;
  const viewId = stableId(value.view_id);
  const viewType = nonBlankString(value.view_type);
  const titleI18n = localizedStrings(value.title_i18n);
  const dataRef = stableRef(value.data_ref);
  const commandIds = value.command_ids === undefined ? undefined : stringArray(value.command_ids);
  const badgeIds = value.badge_ids === undefined ? undefined : stringArray(value.badge_ids);
  const emptyStateI18n =
    value.empty_state_i18n === undefined ? undefined : localizedStrings(value.empty_state_i18n);
  if (
    !viewId ||
    !viewType ||
    !VIEW_TYPES.has(viewType as OplAppContributionViewType) ||
    !titleI18n ||
    !dataRef ||
    commandIds === null ||
    badgeIds === null ||
    emptyStateI18n === null
  ) {
    return null;
  }
  return {
    viewId,
    viewType: viewType as OplAppContributionViewType,
    titleI18n,
    dataRef,
    ...(commandIds === undefined ? {} : { commandIds }),
    ...(badgeIds === undefined ? {} : { badgeIds }),
    ...(emptyStateI18n === undefined ? {} : { emptyStateI18n }),
  };
}

function parseCommand(value: unknown): OplAppContributionCommand | null {
  if (!isRecord(value) || !hasOnlyFields(value, COMMAND_FIELDS)) return null;
  const commandId = stableId(value.command_id);
  const labelI18n = localizedStrings(value.label_i18n);
  const actionRef = stableRef(value.action_ref);
  const confirmationRequired = value.confirmation_required;
  if (
    !commandId ||
    !labelI18n ||
    !actionRef ||
    (confirmationRequired !== undefined && typeof confirmationRequired !== 'boolean')
  ) {
    return null;
  }
  return {
    commandId,
    labelI18n,
    actionRef,
    ...(typeof confirmationRequired === 'boolean' ? { confirmationRequired } : {}),
  };
}

function parseBadge(value: unknown): OplAppContributionBadge | null {
  const badgeFields = new Set(['badge_id', 'label_i18n', 'data_ref', 'tone']);
  if (!isRecord(value) || !hasOnlyFields(value, badgeFields)) return null;
  const badgeId = stableId(value.badge_id);
  const labelI18n = localizedStrings(value.label_i18n);
  const dataRef = stableRef(value.data_ref);
  const tone = parseOptionalString(value.tone);
  if (
    !badgeId ||
    !labelI18n ||
    !dataRef ||
    tone === null ||
    (tone !== undefined && !BADGE_TONES.has(tone))
  ) {
    return null;
  }
  return {
    badgeId,
    labelI18n,
    dataRef,
    ...(tone === undefined ? {} : { tone: tone as OplAppContributionBadge['tone'] }),
  };
}

function parseUniqueList<T>(
  value: unknown,
  parse: (entry: unknown) => T | null,
  identity: (entry: T) => string
): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const parsed = value.map(parse);
  if (parsed.some((entry) => entry === null)) return null;
  const entries = parsed as T[];
  return new Set(entries.map(identity)).size === entries.length ? entries : null;
}

export function parseOplAppContributions(value: unknown): OplAppContributions | null {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ROOT_FIELDS) ||
    hasForbiddenField(value) ||
    value.schema_version !== 'opl-app-contributions.v1'
  ) {
    return null;
  }
  const navigation = parseUniqueList(value.navigation, parseNavigation, (entry) => entry.navigationId);
  const views = parseUniqueList(value.views, parseView, (entry) => entry.viewId);
  const commands = parseUniqueList(value.commands, parseCommand, (entry) => entry.commandId);
  const badges = parseUniqueList(value.badges, parseBadge, (entry) => entry.badgeId);
  if (!navigation || !views || !commands || !badges) return null;
  if (navigation.length + views.length + commands.length + badges.length === 0) return null;

  const viewIds = new Set(views.map((entry) => entry.viewId));
  if (navigation.some((entry) => !viewIds.has(entry.viewId))) return null;
  const commandIds = new Set(commands.map((entry) => entry.commandId));
  if (views.some((entry) => entry.commandIds?.some((commandId) => !commandIds.has(commandId)))) return null;
  const badgeIds = new Set(badges.map((entry) => entry.badgeId));
  if (views.some((entry) => entry.badgeIds?.some((badgeId) => !badgeIds.has(badgeId)))) return null;

  return {
    schemaVersion: 'opl-app-contributions.v1',
    navigation,
    views,
    commands,
    badges,
  };
}

/** Read role-neutral Package contributions from the live Framework directory. */
export function getOplPackageAppContributionsFromAppState(appState: unknown): OplPackageAppContributions[] {
  const payload = isRecord(appState) ? appState : {};
  const state = isRecord(payload.app_state) ? payload.app_state : payload;
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  if (!Array.isArray(directory.entries)) return [];

  const packageIds = new Set<string>();
  return directory.entries.flatMap((value) => {
    if (!isRecord(value)) return [];
    const packageId = nonBlankString(value.package_id);
    const contributions = parseOplAppContributions(value.app_contributions);
    if (!packageId || packageIds.has(packageId) || !contributions) return [];
    packageIds.add(packageId);
    return [{ packageId, installed: value.installed === true, contributions }];
  });
}
