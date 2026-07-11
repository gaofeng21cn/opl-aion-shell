/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Preference row component
 * Displays a label and control in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  label: string;
  children: React.ReactNode;
  description?: string;
  testId?: string;
}> = ({ label, children, description, testId }) => (
  <div className='opl-settings-row' data-testid={testId}>
    <div className='opl-settings-row__main flex-1'>
      <div className='text-14px text-2'>{label}</div>
      {description && <div className='text-12px text-t-tertiary mt-4px'>{description}</div>}
    </div>
    <div className='opl-settings-row__meta w-full md:w-160px'>{children}</div>
  </div>
);

export default PreferenceRow;
