/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const streamdownMocks = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
}));

vi.mock('streamdown', () => ({
  Streamdown: (props: Record<string, unknown>) => {
    streamdownMocks.props.push(props);
    return <div data-testid='streamdown'>{props.children as React.ReactNode}</div>;
  },
  defaultRemarkPlugins: {
    gfm: 'remark-gfm-plugin',
    math: 'remark-math-plugin',
  },
  defaultRehypePlugins: {
    raw: 'rehype-raw-plugin',
    sanitize: 'rehype-sanitize-plugin',
    katex: 'rehype-katex-plugin',
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      fetchRemoteImage: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  joinPath: (base: string, rel: string) => `${base}/${rel}`,
}));

vi.mock('@/renderer/hooks/chat/useAutoScroll', () => ({
  useAutoScroll: () => {},
}));

vi.mock('@/renderer/hooks/ui/useTextSelection', () => ({
  useTextSelection: () => ({ selectedText: '', selectionPosition: null, clearSelection: vi.fn() }),
}));

vi.mock('@/renderer/hooks/chat/useTypingAnimation', () => ({
  useTypingAnimation: ({ content }: { content: string }) => ({
    displayedContent: content,
    isAnimating: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
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

vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({
  default: () => <div data-testid='mermaid-block' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';

describe('MarkdownViewer', () => {
  it('configures Streamdown for Shiki, Mermaid, and KaTeX rendering', () => {
    render(<MarkdownViewer content={'```mermaid\ngraph TD; A-->B\n```\n\n$E=mc^2$'} />);

    const props = streamdownMocks.props.at(-1);
    expect(props?.shikiTheme).toBeTruthy();
    expect(props?.mermaid).toEqual({ config: { theme: expect.any(String) } });
    expect(props?.rehypePlugins).toContain('rehype-katex-plugin');
  });

  it('renders markdown content in preview mode', () => {
    render(<MarkdownViewer content='# Hello World' />);
    expect(screen.getByTestId('streamdown')).toHaveTextContent('# Hello World');
  });

  it('renders MarkdownEditor in source mode', () => {
    render(<MarkdownViewer content='# Test' viewMode='source' />);
    expect(screen.getByTestId('markdown-editor')).toBeInTheDocument();
  });

  it('hides toolbar when hideToolbar is true', () => {
    render(<MarkdownViewer content='# Test' hideToolbar />);
    expect(screen.queryByText('preview.preview')).not.toBeInTheDocument();
  });
});
