/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React from 'react';

type OplRefreshIconButtonProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'icon'> & {
  label: string;
};

const OplRefreshIconButton: React.FC<OplRefreshIconButtonProps> = ({ label, ...buttonProps }) => (
  <Tooltip content={label}>
    <Button
      {...buttonProps}
      aria-label={label}
      icon={<Refresh aria-hidden='true' theme='outline' size={14} fill='currentColor' />}
    />
  </Tooltip>
);

export default OplRefreshIconButton;
