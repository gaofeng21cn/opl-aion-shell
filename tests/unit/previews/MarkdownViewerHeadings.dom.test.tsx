/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      fetchRemoteImage: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  joinPath: (base: string, rel: string) => `${base}/${rel}`,
}));

vi.mock('@/renderer/hooks/ui/useTextSelection', () => ({
  useTextSelection: () => ({ selectedText: '', selectionPosition: null, clearSelection: vi.fn() }),
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor', () => ({
  default: () => <div data-testid='markdown-editor' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/renderers/SelectionToolbar', () => ({
  default: () => <div data-testid='selection-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks/useScrollSyncHelpers', () => ({
  useContainerScroll: vi.fn(),
  useContainerScrollTarget: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';

describe('MarkdownViewer heading rendering', () => {
  it('renders distinct texts for multiple headings of the same level', () => {
    const content = ['# Alpha Title', 'body one', '# Beta Title', 'body two', '# Gamma Title'].join('\n\n');
    render(<MarkdownViewer content={content} />);

    expect(screen.getByText('Alpha Title')).toBeInTheDocument();
    expect(screen.getByText('Beta Title')).toBeInTheDocument();
    expect(screen.getByText('Gamma Title')).toBeInTheDocument();
  });

  it('updates every heading when a growing document is re-rendered', () => {
    const { rerender } = render(<MarkdownViewer content={'# Chapter One'} />);
    expect(screen.getByText('Chapter One')).toBeInTheDocument();

    rerender(<MarkdownViewer content={'# Chapter One\n\ntext\n\n# Chapter Two'} />);
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
    expect(screen.getByText('Chapter Two')).toBeInTheDocument();

    rerender(<MarkdownViewer content={'# Intro\n\ntext\n\n# Chapter One\n\ntext\n\n# Chapter Two'} />);
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
    expect(screen.getByText('Chapter Two')).toBeInTheDocument();
  });

  it('updates distinct heading texts when raw HTML removes source positions', () => {
    const content = ['<div>raw html block</div>', '## Section A', 'body', '## Section B'].join('\n\n');
    const { rerender } = render(<MarkdownViewer content={content} />);

    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('Section B')).toBeInTheDocument();

    const updated = ['<div>raw html block</div>', '## Renamed A', 'body', '## Renamed B'].join('\n\n');
    rerender(<MarkdownViewer content={updated} />);

    expect(screen.getByText('Renamed A')).toBeInTheDocument();
    expect(screen.getByText('Renamed B')).toBeInTheDocument();
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });
});
