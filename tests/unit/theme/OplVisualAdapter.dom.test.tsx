import type { IIconBase } from '@icon-park/react/es/runtime';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { OplIcon, OplVisualProvider } from '@/renderer/components/opl/OplVisualProvider';

const FakeIcon: React.FC<IIconBase> = (props) => (
  <span
    data-testid='fake-icon'
    data-size={String(props.size)}
    data-stroke-width={String(props.strokeWidth)}
    data-theme={props.theme}
    data-fill={String(props.fill)}
    aria-hidden={(props as IIconBase & { 'aria-hidden'?: string })['aria-hidden']}
    className={props.className}
  />
);

describe('OPL visual adapter', () => {
  it('applies the shared optical contract while preserving call-site sizing and accessibility props', () => {
    render(
      <OplVisualProvider>
        <OplIcon icon={FakeIcon} size={14} aria-hidden='true' className='utility-icon' />
      </OplVisualProvider>
    );

    const icon = screen.getByTestId('fake-icon');
    expect(icon).toHaveAttribute('data-size', '14');
    expect(icon).toHaveAttribute('data-stroke-width', '4.5');
    expect(icon).toHaveAttribute('data-theme', 'outline');
    expect(icon).toHaveAttribute('data-fill', 'currentColor');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('utility-icon');
  });

  it('keeps the adapter display-only and usable with the provider omitted', () => {
    render(<OplIcon icon={FakeIcon} />);

    expect(screen.getByTestId('fake-icon')).toHaveAttribute('data-size', '16');
  });
});
