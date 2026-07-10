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

vi.mock('@/renderer/pages/guid/components/GuidWorkspaceFootnote', () => ({
  default: ({ activeCapabilityLabel }: { activeCapabilityLabel?: string }) => (
    <div data-testid='workspace-footnote'>{activeCapabilityLabel}</div>
  ),
}));

function createCard(
  options: {
    slashCommandMenu?: React.ReactNode;
    fileContextEnabled?: boolean;
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
      mentionOpen={false}
      mentionDropdown={null}
      files={[]}
      onRemoveFile={vi.fn()}
      actionRow={<div data-testid='action-row' />}
      slashCommandMenu={options.slashCommandMenu}
      workspaceDir=''
      onSelectWorkspace={vi.fn()}
      onClearWorkspace={vi.fn()}
      activeCapabilityLabel='Research'
      fileContextEnabled={options.fileContextEnabled}
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

    expect(initialAutoSize).toEqual({ minRows: 2, maxRows: 20 });
    expect(arcoCaptures.autoSize.at(-1)).toBe(initialAutoSize);
    expect(screen.getByTestId('guid-input')).toBeInTheDocument();
  });

  it('renders only the composer controls and leaves runtime activity off Home', () => {
    renderCard();

    expect(screen.getByTestId('guid-input')).toHaveAttribute('placeholder', 'Describe task');
    expect(screen.queryByTestId('mention-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-progress')).toBeInTheDocument();
    expect(screen.getByTestId('action-row')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-footnote')).toHaveTextContent('Research');
    expect(screen.queryByTestId('guid-activity-center')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-continue-context-entry')).not.toBeInTheDocument();
  });

  it('renders the slash command menu below the composer when provided', () => {
    renderCard({ slashCommandMenu: <div data-testid='guid-slash-menu'>Commands</div> });

    expect(screen.getByTestId('guid-slash-menu')).toBeInTheDocument();
  });

  it('keeps projectless text input available without accepting file paste or drop', () => {
    const onPaste = vi.fn();
    const onDrop = vi.fn();
    renderCard({ fileContextEnabled: false, onPaste, dragHandlers: { onDrop } });

    fireEvent.paste(screen.getByTestId('guid-input'));
    fireEvent.drop(screen.getByTestId('guid-input-card-shell'));

    expect(onPaste).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getByTestId('guid-input')).toBeEnabled();
  });
});
