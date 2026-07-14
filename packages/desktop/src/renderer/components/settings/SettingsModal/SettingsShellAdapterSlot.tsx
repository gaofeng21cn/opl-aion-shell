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
import { AccessSettingsContent, GatewaySettingsContent } from '@/renderer/pages/settings/sections/AccessSettings';
import { ResourcesSettingsContent } from '@/renderer/pages/settings/sections/ResourcesSettings';
import type { CapabilitiesTab } from '@/renderer/pages/settings/CapabilitiesSettings';

const AboutModalContent = React.lazy(() => import('./contents/AboutModalContent'));
const StorageSettings = React.lazy(() => import('@/renderer/pages/settings/StorageSettings'));
const AgentPackagesSettingsContent = React.lazy(() =>
  import('@/renderer/pages/settings/CapabilitiesSettings').then((module) => ({
    default: module.AgentPackagesSettingsContent,
  }))
);
const CapabilitiesSettingsContent = React.lazy(() =>
  import('@/renderer/pages/settings/CapabilitiesSettings').then((module) => ({
    default: module.CapabilitiesSettingsContent,
  }))
);

const withLazySettingsFallback = (content: React.ReactNode) => (
  <React.Suspense
    fallback={<div className='min-h-160px w-full' data-testid='settings-slot-loading' aria-busy='true' />}
  >
    {content}
  </React.Suspense>
);

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
  CapabilitiesSettingsContent: ({ capabilitiesTab, onCapabilitiesTabChange }) =>
    withLazySettingsFallback(
      <CapabilitiesSettingsContent activeTab={capabilitiesTab} onTabChange={onCapabilitiesTabChange} />
    ),
  AgentPackagesSettingsContent: () => withLazySettingsFallback(<AgentPackagesSettingsContent />),
  GatewaySettingsContent: () => <GatewaySettingsContent />,
  AccessSettingsContent: () => <AccessSettingsContent />,
  ResourcesSettingsContent: () => <ResourcesSettingsContent />,
  AppearanceModalContent: () => <AppearanceModalContent />,
  AboutModalContent: () => withLazySettingsFallback(<AboutModalContent />),
  SystemModalContent: () => <SystemModalContent />,
  StorageSettings: () => withLazySettingsFallback(<StorageSettings withWrapper={false} />),
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
