import MobileWorkspaceOverlay from '@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.sidePanel.close': 'Close tools',
        'conversation.sidePanel.title': 'Tools',
      })[key] ?? key,
  }),
}));

describe('MobileWorkspaceOverlay accessibility', () => {
  afterEach(() => {
    document.querySelector('[data-testid="background"]')?.remove();
    document.querySelector('[data-testid="outside"]')?.remove();
    document.querySelector('[data-testid="rail"]')?.remove();
  });

  it('creates a modal focus boundary, closes on Escape, and restores focus', async () => {
    const background = document.createElement('main');
    background.dataset.testid = 'background';
    const opener = document.createElement('button');
    opener.textContent = 'Open tools';
    background.appendChild(opener);
    document.body.appendChild(background);
    const rail = document.createElement('nav');
    rail.dataset.testid = 'rail';
    const railButton = document.createElement('button');
    railButton.textContent = 'Rail action';
    rail.appendChild(railButton);
    document.body.appendChild(rail);
    opener.focus();
    const setCollapsed = vi.fn();
    const props = {
      rightSiderCollapsed: false,
      setRightSiderCollapsed: setCollapsed,
      workspaceWidthPx: 380,
      mobileWorkspaceHandleRight: 366,
      siderTitle: 'Tools',
      sider: <button type='button'>Inside tool</button>,
    };
    const { rerender } = render(<MobileWorkspaceOverlay {...props} />);

    const dialog = screen.getByRole('dialog', { name: 'Tools' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('inert');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Rail action' })).toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(setCollapsed).toHaveBeenCalledWith(true);

    rerender(<MobileWorkspaceOverlay {...props} rightSiderCollapsed />);
    expect(background).not.toHaveAttribute('inert');
    expect(background).not.toHaveAttribute('aria-hidden');
    expect(rail).not.toHaveAttribute('inert');
    expect(rail).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: 'Rail action' })).toBeTruthy();
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    [
      'hidden',
      <div hidden>
        <button type='button'>Hidden tool</button>
      </div>,
    ],
    [
      'aria-hidden',
      <div aria-hidden='true'>
        <button type='button'>Hidden tool</button>
      </div>,
    ],
    [
      'inert',
      <div inert>
        <button type='button'>Hidden tool</button>
      </div>,
    ],
  ])('skips controls in keep-alive tool subtrees with a %s ancestor', (_attribute, hiddenTool) => {
    render(
      <MobileWorkspaceOverlay
        rightSiderCollapsed={false}
        setRightSiderCollapsed={vi.fn()}
        workspaceWidthPx={380}
        mobileWorkspaceHandleRight={366}
        sider={
          <>
            <button type='button'>Visible tool</button>
            {hiddenTool}
          </>
        }
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Tools' });
    const visibleTool = within(dialog).getByRole('button', { name: 'Visible tool' });
    for (const button of dialog.querySelectorAll('button')) {
      if (button.textContent !== 'Visible tool' && button.textContent !== 'Hidden tool') button.disabled = true;
    }
    visibleTool.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(visibleTool);
  });

  it('falls back to the dialog when a focus target moves focus outside it', () => {
    const outside = document.createElement('button');
    outside.dataset.testid = 'outside';
    document.body.appendChild(outside);
    render(
      <MobileWorkspaceOverlay
        rightSiderCollapsed={false}
        setRightSiderCollapsed={vi.fn()}
        workspaceWidthPx={380}
        mobileWorkspaceHandleRight={366}
        sider={<button type='button'>Inside tool</button>}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Tools' });
    const buttons = within(dialog).getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus = () => outside.focus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(dialog);
  });
});
