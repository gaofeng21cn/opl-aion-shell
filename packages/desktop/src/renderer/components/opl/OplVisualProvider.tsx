/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useLayoutEffect } from 'react';
import type { IIconBase } from '@icon-park/react/es/runtime';
import {
  Export,
  FolderUpload,
  Info,
  Key,
  MessageOne,
  Microphone,
  Microscope,
  Peoples,
  Pushpin,
  Quote,
  Schedule,
  Shield,
  Tips,
  Undo,
} from '@icon-park/react';
import type { IconProps as DshIconProps } from '@/renderer/vendor/deepseek-harness/packages/client/ui-primitives/src/icons/props';
import {
  IconAgentPresetOutline16,
  IconApiOutline14,
  IconArchiveOutline20,
  IconBranchOutline16,
  IconBrowseOutline16,
  IconCheckOutline14,
  IconCheckOutline16,
  IconChecklistOutline14,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconChevronUpOutline14,
  IconCloseFill14,
  IconCloseOutline16,
  IconCodeOutline16,
  IconCopyOutline16,
  IconCordisPluginOutline14,
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconEnhanceOutline16,
  IconFolderClose16,
  IconFolderOpenOutline16,
  IconFollowsystemOutline16,
  IconFullscreenOutline16,
  IconGlobeOutline14,
  IconGoalOutline16,
  IconInspectOutline12,
  IconLightOutline16,
  IconLinkOutline16,
  IconListPenOutline16,
  IconLoadingOutline16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconPaperclipOutline16,
  IconPauseOutline16,
  IconPersonalizationOutline16,
  IconPlayOutline16,
  IconPlusOutline16,
  IconProjectAddOutline16,
  IconQuestionOutline14,
  IconQueueOutline14,
  IconRefreshOutline14,
  IconRefreshOutline16,
  IconRightUpOutline16,
  IconSearchOutline16,
  IconSendOutline14,
  IconSendOutline16,
  IconSettingsOutline14,
  IconSettingsOutline16,
  IconShareOutline16,
  IconSkillOutline16,
  IconSparkle16,
  IconStopFill16,
  IconThinkOutline14,
  IconThinkOutline16,
  IconTrashOutline16,
  IconUserOutline16,
  IconWarningOutline16,
} from '@/renderer/vendor/deepseek-harness/packages/client/ui-primitives/src/icons';
import { OPL_CHROME_ICON_PROPS } from './oplChromeIcon';

export const OPL_DSH_VISUAL_SOURCE_COMMIT = '47f943859bef60e4160492346772ded9b24f765a' as const;

const OPL_DSH_ICONS = {
  agent: IconAgentPresetOutline16,
  api: IconApiOutline14,
  archive: IconArchiveOutline20,
  branch: IconBranchOutline16,
  browse: IconBrowseOutline16,
  check: IconCheckOutline16,
  checkSmall: IconCheckOutline14,
  checklist: IconChecklistOutline14,
  chevronDown: IconChevronDownOutline14,
  chevronLeft: IconChevronLeftOutline14,
  chevronRight: IconChevronRightOutline14,
  chevronUp: IconChevronUpOutline14,
  close: IconCloseOutline16,
  closeFill: IconCloseFill14,
  code: IconCodeOutline16,
  copy: IconCopyOutline16,
  dark: IconDarkOutline16,
  data: IconDataOutline16,
  download: IconDownloadOutline16,
  edit: IconEditOutline16,
  enhance: IconEnhanceOutline16,
  external: IconRightUpOutline16,
  folderClosed: IconFolderClose16,
  folderOpen: IconFolderOpenOutline16,
  fullscreen: IconFullscreenOutline16,
  globe: IconGlobeOutline14,
  goal: IconGoalOutline16,
  help: IconQuestionOutline14,
  inspect: IconInspectOutline12,
  light: IconLightOutline16,
  link: IconLinkOutline16,
  listEdit: IconListPenOutline16,
  loading: IconLoadingOutline16,
  more: IconEllipsisOutline16,
  newChat: IconNewChatOutline16,
  panelLeft: IconPanelLeftOutline16,
  paperclip: IconPaperclipOutline16,
  pause: IconPauseOutline16,
  personalization: IconPersonalizationOutline16,
  play: IconPlayOutline16,
  plugin: IconCordisPluginOutline14,
  plus: IconPlusOutline16,
  projectAdd: IconProjectAddOutline16,
  queue: IconQueueOutline14,
  refresh: IconRefreshOutline16,
  refreshSmall: IconRefreshOutline14,
  search: IconSearchOutline16,
  send: IconSendOutline16,
  sendSmall: IconSendOutline14,
  settings: IconSettingsOutline16,
  settingsSmall: IconSettingsOutline14,
  share: IconShareOutline16,
  skill: IconSkillOutline16,
  sparkle: IconSparkle16,
  stop: IconStopFill16,
  system: IconFollowsystemOutline16,
  think: IconThinkOutline16,
  thinkSmall: IconThinkOutline14,
  trash: IconTrashOutline16,
  user: IconUserOutline16,
  warning: IconWarningOutline16,
} as const satisfies Record<string, React.ComponentType<DshIconProps>>;

// DSH intentionally has a compact glyph set. Keep exact semantic gaps explicit
// here instead of substituting a visually similar but misleading DSH glyph.
const OPL_ICON_COMPATIBILITY_GLYPHS = {
  export: Export,
  folderUpload: FolderUpload,
  info: Info,
  key: Key,
  message: MessageOne,
  microphone: Microphone,
  permission: Shield,
  pin: Pushpin,
  quote: Quote,
  research: Microscope,
  schedule: Schedule,
  team: Peoples,
  tips: Tips,
  undo: Undo,
} as const;

type OplDshIconName = keyof typeof OPL_DSH_ICONS;
type OplCompatibilityIconName = keyof typeof OPL_ICON_COMPATIBILITY_GLYPHS;
export type OplIconName = OplDshIconName | OplCompatibilityIconName;

const OPL_DSH_ICON_NAMES = new Set<string>(Object.keys(OPL_DSH_ICONS));

/** Resolve owner-declared dynamic tokens without exposing the compatibility glyph table. */
export function resolveOplDshIconName(value: unknown): OplDshIconName {
  const token = typeof value === 'string' ? value.trim() : '';
  return OPL_DSH_ICON_NAMES.has(token) ? (token as OplDshIconName) : 'agent';
}

export const OPL_VISUAL_PRIMITIVE_CLASSES = Object.freeze({
  composer: 'opl-codex-composer',
  rail_row: 'opl-codex-rail-row',
  icon_button: 'opl-codex-icon-button',
  menu: 'opl-codex-menu',
  settings_row: 'opl-codex-settings-row',
} as const);

export type OplVisualPrimitiveName = keyof typeof OPL_VISUAL_PRIMITIVE_CLASSES;

export type OplVisualPrimitiveProps = {
  className: string;
  'data-opl-visual-primitive': OplVisualPrimitiveName;
  'data-opl-visual-source': 'deepseek-harness';
};

export function getOplVisualPrimitiveProps(name: OplVisualPrimitiveName, className?: string): OplVisualPrimitiveProps {
  return {
    className: [OPL_VISUAL_PRIMITIVE_CLASSES[name], className].filter(Boolean).join(' '),
    'data-opl-visual-primitive': name,
    'data-opl-visual-source': 'deepseek-harness',
  };
}

export type OplVisualContract = {
  iconSize: number;
  sourceCommit: typeof OPL_DSH_VISUAL_SOURCE_COMMIT;
  darkThemeBodyAttribute: 'data-ds-dark-theme';
};

const OPL_VISUAL_CONTRACT: OplVisualContract = Object.freeze({
  iconSize: 16,
  sourceCommit: OPL_DSH_VISUAL_SOURCE_COMMIT,
  darkThemeBodyAttribute: 'data-ds-dark-theme',
});

const OplVisualContext = createContext<OplVisualContract>(OPL_VISUAL_CONTRACT);

export function syncOplVisualTheme(root: Document = document): void {
  const dark =
    root.documentElement.getAttribute('data-theme') === 'dark' || root.body?.getAttribute('arco-theme') === 'dark';
  root.body?.toggleAttribute(OPL_VISUAL_CONTRACT.darkThemeBodyAttribute, dark);
}

export const OplVisualProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  useLayoutEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

    syncOplVisualTheme(document);
    const observer = new MutationObserver(() => syncOplVisualTheme(document));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['arco-theme'] });
    }
    return () => observer.disconnect();
  }, []);

  return <OplVisualContext.Provider value={OPL_VISUAL_CONTRACT}>{children}</OplVisualContext.Provider>;
};

export const useOplVisual = (): OplVisualContract => useContext(OplVisualContext);

export type OplIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: OplIconName;
  size?: number;
};

export const OplIcon: React.FC<OplIconProps> = ({ name, size, className, style, ...props }) => {
  const visual = useOplVisual();
  const resolvedSize = size ?? visual.iconSize;
  const DshIcon = OPL_DSH_ICONS[name as OplDshIconName] as React.ComponentType<DshIconProps> | undefined;
  const CompatibilityIcon = OPL_ICON_COMPATIBILITY_GLYPHS[name as OplCompatibilityIconName] as
    | React.ComponentType<IIconBase>
    | undefined;
  const source = DshIcon ? 'deepseek-harness' : 'icon-park-compatibility';
  const ariaHidden = props['aria-hidden'] ?? (props['aria-label'] ? undefined : true);
  return (
    <span
      {...props}
      aria-hidden={ariaHidden}
      role={props.role ?? (props['aria-label'] ? 'img' : undefined)}
      className={['opl-icon', className].filter(Boolean).join(' ')}
      data-opl-icon={name}
      data-opl-icon-source={source}
      data-opl-icon-compatibility={CompatibilityIcon ? 'dsh-glyph-unavailable' : undefined}
      style={{ width: resolvedSize, height: resolvedSize, ...style }}
    >
      {DshIcon ? (
        <DshIcon size={resolvedSize} className='block' />
      ) : CompatibilityIcon ? (
        <CompatibilityIcon {...OPL_CHROME_ICON_PROPS} size={resolvedSize} />
      ) : null}
    </span>
  );
};

export default OplVisualProvider;
