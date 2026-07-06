/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SettingsShellRenderSlot } from '@/renderer/pages/settings/registry/settingsRegistry';
import AppearanceModalContent from './contents/AppearanceModalContent';
import SystemModalContent from './contents/SystemModalContent';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import WorkspaceSettings from '@/renderer/pages/settings/sections/WorkspaceSettings';
import LocalServicesSettings from '@/renderer/pages/settings/sections/LocalServicesSettings';
import StorageSettings from '@/renderer/pages/settings/StorageSettings';
import { AccessSettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';
import { ResourcesSettingsContent } from '@/renderer/pages/settings/sections/ResourcesSettings';
import { CapabilitiesSettingsContent, type CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';

export type SettingsShellAdapterSlotProps = {
  slot: SettingsShellRenderSlot | null;
  capabilitiesTab: CapabilitiesTab;
  onCapabilitiesTabChange: (tab: CapabilitiesTab) => void;
};

type SettingsSlotRenderer = (
  props: Pick<SettingsShellAdapterSlotProps, 'capabilitiesTab' | 'onCapabilitiesTabChange'>
) => React.ReactNode;

const settingsSlotRenderers: Record<string, SettingsSlotRenderer> = {
  OverviewSettings: () => <OverviewSettings withWrapper={false} />,
  WorkspaceSettings: () => <WorkspaceSettings withWrapper={false} />,
  LocalServicesSettings: () => <LocalServicesSettings withWrapper={false} />,
  RuntimeSettings: () => <RuntimeSettings withWrapper={false} />,
  CapabilitiesSettingsContent: ({ capabilitiesTab, onCapabilitiesTabChange }) => (
    <CapabilitiesSettingsContent activeTab={capabilitiesTab} onTabChange={onCapabilitiesTabChange} />
  ),
  AccessSettingsContent: () => <AccessSettingsContent />,
  ResourcesSettingsContent: () => <ResourcesSettingsContent />,
  AppearanceModalContent: () => <AppearanceModalContent />,
  SystemModalContent: () => <SystemModalContent />,
  StorageSettings: () => <StorageSettings withWrapper={false} />,
};

const SettingsShellAdapterSlot: React.FC<SettingsShellAdapterSlotProps> = ({
  slot,
  capabilitiesTab,
  onCapabilitiesTabChange,
}) => {
  if (!slot) return null;

  const renderSlot = settingsSlotRenderers[slot.componentKey];
  if (!renderSlot) {
    return null;
  }
  return renderSlot({ capabilitiesTab, onCapabilitiesTabChange });
};

export default SettingsShellAdapterSlot;
