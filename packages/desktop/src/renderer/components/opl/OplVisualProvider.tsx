/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IIconBase } from '@icon-park/react/es/runtime';
import React, { createContext, useContext } from 'react';

import { OPL_CHROME_ICON_PROPS } from './oplChromeIcon';

export type OplVisualContract = {
  icon: Pick<IIconBase, 'size' | 'strokeWidth' | 'theme' | 'fill'>;
};

const OPL_VISUAL_CONTRACT: OplVisualContract = Object.freeze({
  icon: OPL_CHROME_ICON_PROPS,
});

const OplVisualContext = createContext<OplVisualContract>(OPL_VISUAL_CONTRACT);

export const OplVisualProvider: React.FC<React.PropsWithChildren> = ({ children }) => (
  <OplVisualContext.Provider value={OPL_VISUAL_CONTRACT}>{children}</OplVisualContext.Provider>
);

export const useOplVisual = (): OplVisualContract => useContext(OplVisualContext);

export type OplIconComponent = React.ComponentType<IIconBase>;

export type OplIconProps = Omit<IIconBase, 'theme' | 'fill'> & {
  icon: OplIconComponent;
  className?: string;
};

/**
 * Applies the OPL-owned optical contract at the call site without changing
 * IconParkHOC, which is shared by the upstream renderer.
 */
export const OplIcon: React.FC<OplIconProps> = ({ icon: Icon, ...props }) => {
  const { icon } = useOplVisual();
  const className = ['opl-icon', props.className].filter(Boolean).join(' ');
  return React.createElement(Icon, {
    ...icon,
    ...props,
    className,
    theme: 'outline',
    fill: 'currentColor',
  } as IIconBase);
};

export default OplVisualProvider;
