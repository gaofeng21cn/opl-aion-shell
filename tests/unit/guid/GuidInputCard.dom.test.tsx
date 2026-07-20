import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuidInputCard from '@/renderer/pages/guid/components/GuidInputCard';

const arcoCaptures = vi.hoisted(() => ({
  autoSize: [] as unknown[],
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const { createElement } = await import('react');
  const TextArea = actual.Input.TextArea;
  return {
    ...actual,
    Input: {
      ...actual.Input,
      TextArea: (props: React.ComponentProps<typeof TextArea>) => {
        arcoCaptures.autoSize.push(props.autoSize);
        return createElement(TextArea, props);
      },
    },
  };
});

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    isComposing: { current: false },
  }),
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  default: () => <div data-testid='file-preview' />,
}));

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  default: () => <div data-testid='upload-progress' />,
}));

function createCard(
  options: {
    slashCommandMenu?: React.ReactNode;
    mentionOpen?: boolean;
    fileAccessEnabled?: boolean;
    onPaste?: React.ClipboardEventHandler;
    dragHandlers?: React.HTMLAttributes<HTMLDivElement>;
  } = {}
) {
  return (
    <GuidInputCard
      input=''
      onInputChange={vi.fn()}
      onKeyDown={vi.fn()}
      onPaste={options.onPaste ?? vi.fn()}
      onFocus={vi.fn()}
      onBlur={vi.fn()}
      placeholder='Describe task'
      isInputActive={false}
      isFileDragging={false}
      activeBorderColor='#111'
      inactiveBorderColor='#ddd'
      activeShadow='none'
      dragHandlers={options.dragHandlers ?? {}}
      mentionOpen={options.mentionOpen ?? false}
      mentionDropdown={<div data-testid='guid-mention-menu'>Mentions</div>}
      files={[]}
      onRemoveFile={vi.fn()}
      actionRow={<div data-testid='action-row' />}
      slashCommandMenu={options.slashCommandMenu}
      fileAccessEnabled={options.fileAccessEnabled}
    />
  );
}

function renderCard(options: Parameters<typeof createCard>[0] = {}) {
  return render(createCard(options));
}

describe('GuidInputCard compact home composer', () => {
  it('keeps the Arco TextArea autoSize config stable across parent renders', () => {
    arcoCaptures.autoSize.length = 0;
    const view = renderCard();
    const initialAutoSize = arcoCaptures.autoSize.at(-1);

    view.rerender(createCard());

    expect(initialAutoSize).toEqual({ minRows: 1, maxRows: 12 });
    expect(arcoCaptures.autoSize.at(-1)).toBe(initialAutoSize);
    expect(screen.getByTestId('guid-input')).toBeInTheDocument();
  });

  it('renders only the composer controls and leaves runtime activity off Home', () => {
    renderCard();

    expect(screen.getByTestId('guid-input-card-inner')).toBeInTheDocument();
    expect(screen.getByTestId('guid-input')).toHaveAttribute('placeholder', 'Describe task');
    expect(screen.queryByTestId('mention-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-progress')).toBeInTheDocument();
    expect(screen.getByTestId('action-row')).toBeInTheDocument();
    const input = screen.getByTestId('guid-input');
    const actionRow = screen.getByTestId('action-row');
    expect(input.compareDocumentPosition(actionRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('guid-new-task-context-bar')).not.toBeInTheDocument();
    expect(screen.queryByText('No Project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guid-activity-center')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-continue-context-entry')).not.toBeInTheDocument();
  });

  it('keeps the resting composer surface elevated while focus styling remains geometry-neutral', () => {
    const view = renderCard();
    const shell = screen.getByTestId('guid-input-card-shell');
    const inner = screen.getByTestId('guid-input-card-inner');

    expect(shell).toHaveClass('overflow-visible');
    expect(shell).not.toHaveClass('overflow-hidden');
    expect(inner).toHaveStyle({ overflow: 'hidden' });
    expect(inner).toHaveStyle({ boxShadow: 'var(--opl-home-composer-shadow)' });
    expect(inner.getAttribute('style')).toContain('box-shadow 160ms ease');

    view.rerender(
      <GuidInputCard
        input=''
        onInputChange={vi.fn()}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
        placeholder='Describe task'
        isInputActive
        isFileDragging={false}
        activeBorderColor='rgb(32, 33, 36)'
        inactiveBorderColor='rgba(0, 0, 0, 0.14)'
        activeShadow='var(--opl-composer-focus-shadow)'
        dragHandlers={{}}
        mentionOpen={false}
        mentionDropdown={null}
        files={[]}
        onRemoveFile={vi.fn()}
        actionRow={<div data-testid='action-row' />}
      />
    );

    expect(screen.getByTestId('guid-input-card-inner')).toHaveStyle({
      boxShadow: 'var(--opl-composer-focus-shadow)',
    });
  });

  it('renders the slash command menu below the composer when provided', () => {
    renderCard({ slashCommandMenu: <div data-testid='guid-slash-menu'>Commands</div> });

    expect(screen.getByTestId('guid-input-card-inner')).toHaveStyle({ overflow: 'visible' });
    expect(screen.getByTestId('guid-slash-menu')).toBeInTheDocument();
  });

  it('allows mention overlays to escape the rounded content clip', () => {
    renderCard({ mentionOpen: true });

    expect(screen.getByTestId('guid-input-card-inner')).toHaveStyle({ overflow: 'visible' });
    expect(screen.getByTestId('guid-mention-menu')).toBeInTheDocument();
  });

  it('accepts file paste and drop without a selected workspace', () => {
    const onPaste = vi.fn();
    const onDrop = vi.fn();
    renderCard({ onPaste, dragHandlers: { onDrop } });

    fireEvent.paste(screen.getByTestId('guid-input'));
    fireEvent.drop(screen.getByTestId('guid-input-card-shell'));

    expect(onPaste).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it('keeps text input available while runtime file access is blocked', () => {
    const onPaste = vi.fn();
    const onDrop = vi.fn();
    renderCard({ fileAccessEnabled: false, onPaste, dragHandlers: { onDrop } });

    fireEvent.paste(screen.getByTestId('guid-input'));
    fireEvent.drop(screen.getByTestId('guid-input-card-shell'));

    expect(onPaste).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getByTestId('guid-input')).toBeEnabled();
  });
});
