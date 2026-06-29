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
import { CapabilitiesSettingsContent, type CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';

export type SettingsShellAdapterSlotProps = {
  slot: SettingsShellRenderSlot | null;
  capabilitiesTab: CapabilitiesTab;
  onCapabilitiesTabChange: (tab: CapabilitiesTab) => void;
};

const SettingsShellAdapterSlot: React.FC<SettingsShellAdapterSlotProps> = ({
  slot,
  capabilitiesTab,
  onCapabilitiesTabChange,
}) => {
  if (!slot) return null;

  switch (slot.componentKey) {
    case 'OverviewSettings':
      return <OverviewSettings withWrapper={false} />;
    case 'WorkspaceSettings':
      return <WorkspaceSettings withWrapper={false} />;
    case 'LocalServicesSettings':
      return <LocalServicesSettings withWrapper={false} />;
    case 'RuntimeSettings':
      return <RuntimeSettings withWrapper={false} />;
    case 'CapabilitiesSettingsContent':
      return <CapabilitiesSettingsContent activeTab={capabilitiesTab} onTabChange={onCapabilitiesTabChange} />;
    case 'AccessSettingsContent':
      return <AccessSettingsContent />;
    case 'AppearanceModalContent':
      return <AppearanceModalContent />;
    case 'SystemModalContent':
      return <SystemModalContent />;
    case 'StorageSettings':
      return <StorageSettings withWrapper={false} />;
    default:
      return null;
  }
};

export default SettingsShellAdapterSlot;
