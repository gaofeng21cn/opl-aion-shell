import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ComposerCapabilityPalette, {
  calculateComposerCapabilityPaletteGeometry,
  type ComposerCapabilityPaletteGroup,
} from '@/renderer/components/chat/composer/ComposerCapabilityPalette';

const PaletteHarness: React.FC<{
  groups: ComposerCapabilityPaletteGroup[];
  onFileSelect?: () => void;
}> = ({ groups }) => {
  const [open, setOpen] = useState(false);
  return (
    <ComposerCapabilityPalette
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type='button' aria-label='Open capability palette' aria-expanded={open}>
          +
        </button>
      }
      title='Add to conversation'
      searchPlaceholder='Search actions and capabilities'
      noResultsText='No matching actions or capabilities'
      groups={groups}
      testId='test-capability-palette'
    />
  );
};

const buildGroups = (onFileSelect: () => void): ComposerCapabilityPaletteGroup[] => [
  {
    id: 'local_inputs',
    label: 'Files and folders',
    items: [
      {
        id: 'file',
        label: 'Add files',
        description: 'Add documents and images',
        icon: <span>F</span>,
        onSelect: onFileSelect,
      },
      {
        id: 'folder',
        label: 'Add folder',
        description: 'Include a folder of research notes',
        icon: <span>D</span>,
        onSelect: vi.fn(),
      },
    ],
  },
  {
    id: 'agent_packages',
    label: 'Agents',
    items: [
      {
        id: 'agent',
        label: 'Medical research',
        description: 'Use the selected Agent for this new session',
        icon: <span>A</span>,
        onSelect: vi.fn(),
      },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    items: [
      {
        id: 'skill',
        label: 'Literature review',
        description: 'Invoke the loaded Skill',
        icon: <span>S</span>,
        onSelect: vi.fn(),
      },
    ],
  },
  {
    id: 'session_modes',
    label: 'Session modes',
    items: [
      {
        id: 'plan-mode',
        label: 'Plan mode',
        description: 'Plan before making changes',
        icon: <span>M</span>,
        onSelect: vi.fn(),
      },
    ],
  },
  {
    id: 'apps_and_connections',
    label: 'Apps and connections',
    items: [
      {
        id: 'browser',
        label: 'Google Chrome',
        description: 'Attach the active browser tab',
        icon: <span>C</span>,
        onSelect: vi.fn(),
      },
    ],
  },
];

describe('ComposerCapabilityPalette', () => {
  it('keeps the palette above the composer instead of the trigger button', () => {
    expect(
      calculateComposerCapabilityPaletteGeometry({ left: 100, top: 300, width: 736 }, { left: 116, top: 390 })
    ).toEqual({
      width: 736,
      horizontalOffset: -16,
      verticalOffset: 98,
    });
  });

  it('renders named groups, descriptions, stable icon slots, and one internal scroll region', async () => {
    const user = userEvent.setup();
    render(<PaletteHarness groups={buildGroups(vi.fn())} />);

    await user.click(screen.getByRole('button', { name: 'Open capability palette' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add to conversation' });

    expect(within(dialog).getByRole('heading', { name: 'Files and folders' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Agents' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Session modes' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Apps and connections' })).toBeInTheDocument();
    expect(within(dialog).getByText('Include a folder of research notes')).toBeInTheDocument();
    expect(dialog.querySelectorAll('[data-capability-palette-icon]')).toHaveLength(6);
    expect(dialog.querySelectorAll('[data-capability-palette-scroll-region="true"]')).toHaveLength(1);
  });

  it('searches names and descriptions without losing group labels', async () => {
    const user = userEvent.setup();
    render(<PaletteHarness groups={buildGroups(vi.fn())} />);

    await user.click(screen.getByRole('button', { name: 'Open capability palette' }));
    const search = await screen.findByRole('textbox', { name: 'Search actions and capabilities' });
    await waitFor(() => expect(search.closest('.arco-trigger')).toHaveStyle({ pointerEvents: 'auto' }));
    await user.type(search, 'research notes');

    expect(screen.getByRole('button', { name: /Add folder/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add files/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Files and folders' })).toBeInTheDocument();
  });

  it('supports Arrow keys, Home, End, native Enter activation, Escape, and focus return', async () => {
    const onFileSelect = vi.fn();
    const user = userEvent.setup();
    render(<PaletteHarness groups={buildGroups(onFileSelect)} />);

    const opener = screen.getByRole('button', { name: 'Open capability palette' });
    await user.click(opener);
    const search = await screen.findByRole('textbox', { name: 'Search actions and capabilities' });
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    const firstItem = screen.getByTestId('test-capability-palette-item-file');
    const lastItem = screen.getByTestId('test-capability-palette-item-browser');
    expect(firstItem).toHaveFocus();
    await user.keyboard('{End}');
    expect(lastItem).toHaveFocus();
    await user.keyboard('{Home}');
    expect(firstItem).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(lastItem).toHaveFocus();
    await user.keyboard('{Home}{Enter}');

    expect(onFileSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add to conversation' })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());

    await user.click(opener);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search actions and capabilities' })).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add to conversation' })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('shows the explicit empty result instead of changing trigger behavior', async () => {
    const user = userEvent.setup();
    render(<PaletteHarness groups={[]} />);

    await user.click(screen.getByRole('button', { name: 'Open capability palette' }));

    expect(await screen.findByRole('dialog', { name: 'Add to conversation' })).toBeInTheDocument();
    expect(screen.getByText('No matching actions or capabilities')).toBeInTheDocument();
  });
});
