import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import CodeBlock from '@/renderer/components/Markdown/CodeBlock';

describe('CodeBlock', () => {
  it('renders mermaid fenced code as plain code in OPL builds', () => {
    const { container } = render(<CodeBlock className='language-mermaid'>{'flowchart TD\nA-->B'}</CodeBlock>);

    expect(container).toHaveTextContent('<mermaid>');
    expect(container).toHaveTextContent('flowchart TD');
    expect(container).toHaveTextContent('A-->B');
  });
});
