/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type { MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      (
        ({
          'conversation.navigation.back': 'Back',
        }) as Record<string, string>
      )[key] ??
      options?.defaultValue ??
      key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Left: () => <span aria-hidden='true'>left</span>,
  Right: () => <span aria-hidden='true'>right</span>,
}));

describe('MobileActionSheet', () => {
  it('keeps the 400x600 sheet viewport-bound with the lists as the only scroll regions', () => {
    const stylesSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'packages/desktop/src/renderer/components/chat/MobileActionSheet/MobileActionSheet.module.css'
      ),
      'utf8'
    );
    const sheetRule = stylesSource.match(/\.sheet\s*\{([^}]*)\}/)?.[1] ?? '';
    const panesRule = stylesSource.match(/\.panes\s*\{([^}]*)\}/)?.[1] ?? '';
    const paneRule = stylesSource.match(/\.pane\s*\{([^}]*)\}/)?.[1] ?? '';
    const listRule = stylesSource.match(/\.list\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(sheetRule).toContain('100dvh');
    expect(sheetRule).toContain('env(safe-area-inset-top');
    expect(sheetRule).toContain('env(safe-area-inset-bottom');
    expect(sheetRule).toContain('overflow: hidden');
    expect(panesRule).toMatch(/flex:\s*1 1 auto/);
    expect(panesRule).toContain('min-height: 0');
    expect(panesRule).toContain('overflow: hidden');
    expect(paneRule).toContain('min-height: 0');
    expect(paneRule).not.toContain('overflow-y: auto');
    expect(listRule).toContain('min-height: 0');
    expect(listRule).toContain('overflow-y: auto');
    expect(listRule).toContain('overscroll-behavior: contain');
  });

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

    expect(screen.getByRole('dialog', { name: 'More' })).toHaveAttribute('aria-modal', 'true');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isolates the background, traps keyboard focus, closes with Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    const entries: MobileActionSheetEntry[] = [
      { key: 'attach', label: 'Add files' },
      { key: 'settings', label: 'Settings' },
    ];

    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Open actions
          </button>
          <MobileActionSheet open={open} onClose={() => setOpen(false)} title='More' entries={entries} />
        </>
      );
    };

    const { container } = render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open actions' });
    await user.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'More' });
    const firstAction = screen.getByRole('button', { name: 'Add files' });
    const lastAction = screen.getByRole('button', { name: 'Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container).toHaveAttribute('inert');
    expect(container).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(firstAction).toHaveFocus());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(lastAction).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(firstAction).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(lastAction).toHaveFocus();
    await user.keyboard('{Home}');
    expect(firstAction).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument());
    expect(container).not.toHaveAttribute('inert');
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(opener).toHaveFocus();
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

    const backButton = await screen.findByRole('button', { name: 'Back' });
    const nextModel = screen.getByTestId('mobile-action-sheet-option-gpt-5.4');
    await waitFor(() => expect(backButton).toHaveFocus());
    expect(screen.getByTestId('mobile-action-sheet-option-gpt-5.6-sol')).toHaveAttribute('aria-pressed', 'true');
    expect(nextModel).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(nextModel);

    expect(onSelect).toHaveBeenCalledWith('gpt-5.4');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('mobile-action-sheet-model')).toHaveFocus());
  });
});
