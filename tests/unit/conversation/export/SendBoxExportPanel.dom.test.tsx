import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationExportFilePanel } from '@/renderer/components/chat/SendBox';

const translations: Record<string, string> = {
  'messages.export.formatLabel': 'Format',
  'messages.export.markdownLabel': 'Markdown',
  'messages.export.jsonLabel': 'JSON',
  'messages.export.fileNameLabel': 'File name',
  'messages.export.fileNamePlaceholder': 'conversation-export.md',
  'messages.export.directoryLabel': 'Save folder',
  'messages.export.chooseDirectoryLabel': 'Choose folder',
  'messages.export.directoryNotSelected': 'No folder selected',
  'messages.export.pathLabel': 'Save path',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.save': 'Save',
};

describe('SendBox conversation export panel', () => {
  it('exposes explicit format, filename, directory, and save controls', () => {
    const onFormatChange = vi.fn();
    const onFilenameChange = vi.fn();
    const onSelectDirectory = vi.fn();
    const onCancel = vi.fn();
    const onBack = vi.fn();
    const onSave = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <ConversationExportFilePanel
        t={(key) => translations[key] ?? key}
        format='markdown'
        filename='review.md'
        directory=''
        pathPreview=''
        loading={false}
        onFormatChange={onFormatChange}
        onFilenameChange={onFilenameChange}
        onSelectDirectory={onSelectDirectory}
        onCancel={onCancel}
        onBack={onBack}
        onSave={onSave}
        onKeyDown={onKeyDown}
      />
    );

    expect(screen.getByText('No folder selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('JSON'));
    expect(onFormatChange).toHaveBeenCalledWith('json');
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'final.json' } });
    expect(onFilenameChange).toHaveBeenCalledWith('final.json');
    fireEvent.keyDown(screen.getByLabelText('File name'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalled();
    const chooseFolderButton = screen.getByRole('button', { name: 'Choose folder' });
    fireEvent.keyDown(chooseFolderButton, { key: 'Escape' });
    expect(onKeyDown.mock.calls.at(-1)?.[0].key).toBe('Escape');
    fireEvent.click(chooseFolderButton);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSelectDirectory).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
