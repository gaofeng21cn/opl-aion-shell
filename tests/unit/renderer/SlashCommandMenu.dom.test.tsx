import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandMenu, {
  getSlashCommandOptionId,
  type SlashCommandMenuItem,
} from '@/renderer/components/chat/SlashCommandMenu';
import { useSlashCommandController } from '@/renderer/hooks/chat/useSlashCommandController';
import type { SlashCommandItem } from '@/common/chat/slash/types';

const commands: SlashCommandItem[] = ['open', 'review', 'research'].map((name) => ({
  name,
  description: `${name} description`,
  kind: 'template',
  source: 'builtin',
}));

const listboxId = 'slash-command-listbox';

function SlashCommandHarness({ onSelectTemplate }: { onSelectTemplate: (name: string) => void }) {
  const controller = useSlashCommandController({
    input: '/',
    commands,
    onSelectTemplate,
  });
  const items: SlashCommandMenuItem[] = controller.filteredCommands.map((command) => ({
    key: command.name,
    label: `/${command.name}`,
    description: command.description,
  }));
  const activeOptionId =
    controller.isOpen && controller.activeIndex >= 0 && controller.activeIndex < items.length
      ? getSlashCommandOptionId(listboxId, controller.activeIndex)
      : undefined;

  return (
    <>
      <textarea
        data-testid='slash-command-input'
        role='combobox'
        aria-autocomplete='list'
        aria-expanded={controller.isOpen}
        aria-controls={controller.isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onKeyDown={controller.onKeyDown}
      />
      {controller.isOpen && (
        <SlashCommandMenu
          listboxId={listboxId}
          title='Commands'
          items={items}
          activeIndex={controller.activeIndex}
          onHoverItem={controller.setActiveIndex}
          onSelectItem={(item) => {
            const index = controller.filteredCommands.findIndex((command) => command.name === item.key);
            controller.onSelectByIndex(index);
          }}
          emptyText='No commands found'
        />
      )}
    </>
  );
}

describe('SlashCommandMenu combobox interaction', () => {
  it('owns its options, supports Home and End, and keeps focus in the textarea', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const onSelectTemplate = vi.fn();
    const user = userEvent.setup();
    render(<SlashCommandHarness onSelectTemplate={onSelectTemplate} />);

    const input = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox', { name: 'Commands' });
    const options = screen.getAllByRole('option');

    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
    expect(options.map((option) => option.id)).toEqual(
      commands.map((_command, index) => getSlashCommandOptionId(listboxId, index))
    );

    input.focus();
    expect(fireEvent.keyDown(input, { key: 'End' })).toBe(false);
    expect(input).toHaveAttribute('aria-activedescendant', options[2]?.id);
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();

    expect(fireEvent.keyDown(input, { key: 'Home' })).toBe(false);
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();

    await user.click(options[1]!);
    expect(onSelectTemplate).toHaveBeenCalledWith('review');
    expect(input).toHaveFocus();
  });
});
