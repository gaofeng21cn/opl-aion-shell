/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Typography } from '@arco-design/web-react';

type SettingRowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const SettingRow: React.FC<SettingRowProps> = ({ title, description, children }) => (
  <div className='flex flex-col gap-12px px-16px py-14px md:grid md:grid-cols-[220px_minmax(280px,440px)] md:items-center md:gap-28px'>
    <div className='min-w-0'>
      <Typography.Text className='block text-14px font-500 text-t-primary'>{title}</Typography.Text>
      {description && (
        <Typography.Text className='block text-12px text-t-secondary mt-3px'>{description}</Typography.Text>
      )}
    </div>
    <div className='min-w-0'>{children}</div>
  </div>
);

export default SettingRow;
