import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getOplVisualPrimitiveProps,
  OplIcon,
  OplVisualProvider,
  resolveOplDshIconName,
  syncOplVisualTheme,
} from '@/renderer/components/opl/OplVisualProvider';

describe('OPL visual adapter', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('arco-theme');
    document.body.removeAttribute('data-ds-dark-theme');
  });

  it('resolves only DSH dynamic tokens and uses agent for missing or compatibility-only values', () => {
    expect(resolveOplDshIconName('send')).toBe('send');
    expect(resolveOplDshIconName('research')).toBe('agent');
    expect(resolveOplDshIconName('folderUpload')).toBe('agent');
    expect(resolveOplDshIconName(undefined)).toBe('agent');
  });

  it('renders a DSH glyph through the name adapter while preserving sizing and accessibility props', () => {
    render(
      <OplVisualProvider>
        <OplIcon name='send' size={14} aria-hidden='true' className='utility-icon' data-testid='dsh-icon' />
      </OplVisualProvider>
    );

    const icon = screen.getByTestId('dsh-icon');
    expect(icon).toHaveAttribute('data-opl-icon', 'send');
    expect(icon).toHaveAttribute('data-opl-icon-source', 'deepseek-harness');
    expect(icon).not.toHaveAttribute('data-opl-icon-compatibility');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('opl-icon', 'utility-icon');
    expect(icon).toHaveStyle({ width: '14px', height: '14px' });

    const svg = icon.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
  });

  it('marks a semantic gap as IconPark compatibility instead of pretending it is a DSH glyph', () => {
    render(<OplIcon name='microphone' size={14} data-testid='compatibility-icon' />);

    const icon = screen.getByTestId('compatibility-icon');
    expect(icon).toHaveAttribute('data-opl-icon', 'microphone');
    expect(icon).toHaveAttribute('data-opl-icon-source', 'icon-park-compatibility');
    expect(icon).toHaveAttribute('data-opl-icon-compatibility', 'dsh-glyph-unavailable');
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('bridges current AionUI light and dark state to the DSH body attribute', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(
      <OplVisualProvider>
        <OplIcon name='send' />
      </OplVisualProvider>
    );

    await waitFor(() => expect(document.body).toHaveAttribute('data-ds-dark-theme'));

    document.documentElement.setAttribute('data-theme', 'light');
    await waitFor(() => expect(document.body).not.toHaveAttribute('data-ds-dark-theme'));

    document.body.setAttribute('arco-theme', 'dark');
    await waitFor(() => expect(document.body).toHaveAttribute('data-ds-dark-theme'));

    document.body.setAttribute('arco-theme', 'light');
    await waitFor(() => expect(document.body).not.toHaveAttribute('data-ds-dark-theme'));
  });

  it('keeps theme synchronization callable without a provider and uses the 16px default', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    syncOplVisualTheme(document);

    render(<OplIcon name='send' data-testid='default-icon' />);

    expect(screen.getByTestId('default-icon')).toHaveStyle({ width: '16px', height: '16px' });
    expect(document.body).toHaveAttribute('data-ds-dark-theme');
  });

  it('binds phase-one primitive classes to the pinned visual source', () => {
    render(<button {...getOplVisualPrimitiveProps('icon_button', 'custom-control')}>Open</button>);

    const button = screen.getByRole('button', { name: 'Open' });
    expect(button).toHaveClass('opl-codex-icon-button', 'custom-control');
    expect(button).toHaveAttribute('data-opl-visual-primitive', 'icon_button');
    expect(button).toHaveAttribute('data-opl-visual-source', 'deepseek-harness');
  });
});
