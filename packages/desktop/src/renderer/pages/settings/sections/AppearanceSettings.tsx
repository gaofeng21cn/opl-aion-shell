/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AppearanceModalContent from '@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const AppearanceSettings: React.FC = () => (
  <SettingsPageWrapper contentClassName='max-w-980px'>
    <AppearanceModalContent />
  </SettingsPageWrapper>
);

export default AppearanceSettings;
