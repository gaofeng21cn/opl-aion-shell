/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { OplIcon } from './OplVisualProvider';

type OplRefreshIconButtonProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'icon'> & {
  label: string;
};

const OplRefreshIconButton: React.FC<OplRefreshIconButtonProps> = ({ label, ...buttonProps }) => (
  <Tooltip content={label}>
    <Button {...buttonProps} aria-label={label} icon={<OplIcon name='refreshSmall' size={14} aria-hidden='true' />} />
  </Tooltip>
);

export default OplRefreshIconButton;
