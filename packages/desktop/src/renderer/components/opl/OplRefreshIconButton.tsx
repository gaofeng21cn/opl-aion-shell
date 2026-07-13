import { faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Tooltip } from '@arco-design/web-react';
import React from 'react';

type OplRefreshIconButtonProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'icon'> & {
  label: string;
};

const OplRefreshIconButton: React.FC<OplRefreshIconButtonProps> = ({ label, ...buttonProps }) => (
  <Tooltip content={label}>
    <Button {...buttonProps} aria-label={label} icon={<FontAwesomeIcon icon={faRotateRight} className='text-14px' />} />
  </Tooltip>
);

export default OplRefreshIconButton;
