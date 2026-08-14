/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPL_UI_CONTRIBUTION_SLOTS = ['composer.palette', 'runtime.detail', 'settings.section'] as const;

export type OplUiContributionSlot = (typeof OPL_UI_CONTRIBUTION_SLOTS)[number];
export type OplUiLocalizedText = Record<string, string>;

export type OplUiContributionCommand = {
  commandId: string;
  label: OplUiLocalizedText;
  actionRef: string;
  confirmationRequired: boolean;
};

export type OplUiContributionBadge = {
  badgeId: string;
  label: OplUiLocalizedText;
  dataRef: string;
  tone: string;
};

export type OplUiContributionView = {
  viewId: string;
  viewType: string;
  title: OplUiLocalizedText;
  dataRef: string;
  emptyState?: OplUiLocalizedText;
};

export type OplUiContribution = {
  contributionKey: string;
  contributionId: string;
  packageId: string;
  slot: OplUiContributionSlot;
  contributionKind: string;
  trustTier: string;
  scope: string;
  sortOrder: number;
  view?: OplUiContributionView;
  commands: OplUiContributionCommand[];
  badges: OplUiContributionBadge[];
};

export type OplUiContributionsProjection = {
  surfaceKind: 'opl_app_ui_contributions_projection.v1' | 'unavailable';
  entries: OplUiContribution[];
};

const EMPTY_PROJECTION: OplUiContributionsProjection = Object.freeze({
  surfaceKind: 'unavailable',
  entries: Object.freeze([]) as unknown as OplUiContribution[],
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function localizedText(value: unknown): OplUiLocalizedText {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).flatMap(([locale, text]) => {
      const normalized = asString(text);
      return normalized ? [[locale, normalized]] : [];
    })
  );
}

function parseCommand(value: unknown): OplUiContributionCommand | null {
  const command = asRecord(value);
  const commandId = asString(command?.command_id);
  const actionRef = asString(command?.action_ref);
  if (!commandId || !actionRef) return null;
  return {
    commandId,
    label: localizedText(command?.label_i18n),
    actionRef,
    confirmationRequired: command?.confirmation_required === true,
  };
}

function parseBadge(value: unknown): OplUiContributionBadge | null {
  const badge = asRecord(value);
  const badgeId = asString(badge?.badge_id);
  const dataRef = asString(badge?.data_ref);
  if (!badgeId || !dataRef) return null;
  return {
    badgeId,
    label: localizedText(badge?.label_i18n),
    dataRef,
    tone: asString(badge?.tone) ?? 'neutral',
  };
}

function parseView(value: unknown): OplUiContributionView | undefined {
  const view = asRecord(value);
  const viewId = asString(view?.view_id);
  const viewType = asString(view?.view_type);
  const dataRef = asString(view?.data_ref);
  if (!viewId || !viewType || !dataRef) return undefined;
  const emptyState = localizedText(view?.empty_state_i18n);
  return {
    viewId,
    viewType,
    title: localizedText(view?.title_i18n),
    dataRef,
    ...(Object.keys(emptyState).length > 0 ? { emptyState } : {}),
  };
}

function parseEntry(value: unknown): OplUiContribution | null {
  const entry = asRecord(value);
  const contributionKey = asString(entry?.contribution_key);
  const contributionId = asString(entry?.contribution_id);
  const packageId = asString(entry?.package_id);
  const slot = asString(entry?.slot);
  if (
    !contributionKey ||
    !contributionId ||
    !packageId ||
    contributionKey !== `${packageId}:${contributionId}` ||
    !slot ||
    !OPL_UI_CONTRIBUTION_SLOTS.includes(slot as OplUiContributionSlot)
  ) {
    return null;
  }

  const view = parseView(entry?.view);
  return {
    contributionKey,
    contributionId,
    packageId,
    slot: slot as OplUiContributionSlot,
    contributionKind: asString(entry?.contribution_kind) ?? 'unknown',
    trustTier: asString(entry?.trust_tier) ?? 'unknown',
    scope: asString(entry?.scope) ?? 'root',
    sortOrder: typeof entry?.sort_order === 'number' && Number.isFinite(entry.sort_order) ? entry.sort_order : 0,
    ...(view ? { view } : {}),
    commands: Array.isArray(entry?.commands)
      ? entry.commands.map(parseCommand).filter((command): command is OplUiContributionCommand => command !== null)
      : [],
    badges: Array.isArray(entry?.badges)
      ? entry.badges.map(parseBadge).filter((badge): badge is OplUiContributionBadge => badge !== null)
      : [],
  };
}

export function readOplUiContributionsProjection(state: unknown): OplUiContributionsProjection {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  const projection = asRecord(appState?.ui_contributions);
  if (projection?.surface_kind !== 'opl_app_ui_contributions_projection.v1') return EMPTY_PROJECTION;

  const entries = Array.isArray(projection.entries)
    ? projection.entries.map(parseEntry).filter((entry): entry is OplUiContribution => entry !== null)
    : [];
  entries.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.packageId.localeCompare(right.packageId) ||
      left.contributionId.localeCompare(right.contributionId)
  );
  return { surfaceKind: 'opl_app_ui_contributions_projection.v1', entries };
}

export function hasPackageContributionExecuteAction(state: unknown): boolean {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  return Array.isArray(appState?.actions)
    ? appState.actions.some((entry) => asRecord(entry)?.action_id === 'package_contribution_execute')
    : false;
}

export function resolveOplUiContributionLabel(text: OplUiLocalizedText, locale: string, fallback: string): string {
  const normalizedLocale = locale.toLowerCase();
  const preferred = normalizedLocale.startsWith('zh') ? ['zh-CN', 'zh', 'en-US', 'en'] : ['en-US', 'en', 'zh-CN', 'zh'];
  return preferred.map((key) => text[key]).find(Boolean) ?? Object.values(text).find(Boolean) ?? fallback;
}
