/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type { MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Left: () => <span aria-hidden='true'>left</span>,
  Right: () => <span aria-hidden='true'>right</span>,
}));

describe('MobileActionSheet', () => {
  it('does not render a dialog while closed', () => {
    render(<MobileActionSheet open={false} onClose={vi.fn()} entries={[]} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs a top-level action and closes the sheet', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const entries: MobileActionSheetEntry[] = [{ key: 'attach', label: 'Add files', onClick }];

    render(<MobileActionSheet open onClose={onClose} title='More' entries={entries} />);
    fireEvent.click(screen.getByTestId('mobile-action-sheet-attach'));

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a single-select sheet open and exposes a keyboard-reachable back control', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const entries: MobileActionSheetEntry[] = [
      {
        key: 'model',
        label: 'Model',
        submenu: {
          title: 'Model',
          options: [
            { key: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', active: true },
            { key: 'gpt-5.4', label: 'GPT-5.4' },
          ],
          onSelect,
        },
      },
    ];

    render(<MobileActionSheet open onClose={onClose} entries={entries} />);
    fireEvent.click(screen.getByTestId('mobile-action-sheet-model'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-gpt-5.4'));

    expect(onSelect).toHaveBeenCalledWith('gpt-5.4');
    expect(onClose).not.toHaveBeenCalled();
  });
});
