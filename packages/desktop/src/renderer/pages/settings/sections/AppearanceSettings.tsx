/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import DisplayModalContent from '@/renderer/components/settings/SettingsModal/contents/DisplayModalContent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const AppearanceSettings: React.FC = () => (
  <SettingsPageWrapper contentClassName='max-w-980px'>
    <DisplayModalContent />
  </SettingsPageWrapper>
);

export default AppearanceSettings;
