import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';

const changeLanguageMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: changeLanguageMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/components/base/AionSelect', async () => {
  const ReactModule = await import('react');
  const Select = ReactModule.forwardRef<
    HTMLSelectElement,
    {
      disabled?: boolean;
      children?: React.ReactNode;
      value?: string;
      onChange?: (value: string) => void;
    }
  >(({ children, value, onChange, disabled }, ref) => (
    <select
      disabled={disabled}
      ref={ref}
      aria-label='language'
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {children}
    </select>
  ));
  return { default: Object.assign(Select, { Option: 'option' }) };
});

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  it('does not persist on mount or a same-language control event', () => {
    render(<LanguageSwitcher />);

    const select = screen.getByRole('combobox', { name: 'language' });
    expect(changeLanguageMock).not.toHaveBeenCalled();

    fireEvent.change(select, { target: { value: 'zh-CN' } });
    expect(changeLanguageMock).not.toHaveBeenCalled();
  });

  it('persists a changed language selected by the user', async () => {
    render(<LanguageSwitcher />);

    fireEvent.change(screen.getByRole('combobox', { name: 'language' }), { target: { value: 'en-US' } });

    expect(changeLanguageMock).toHaveBeenCalledOnce();
    expect(changeLanguageMock).toHaveBeenCalledWith('en-US');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });
  it('reports a failed language save and allows retry', async () => {
    changeLanguageMock.mockRejectedValueOnce(new Error('offline'));
    render(<LanguageSwitcher />);
    const select = screen.getByRole('combobox', { name: 'language' });
    fireEvent.change(select, { target: { value: 'en-US' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not save language. Try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(changeLanguageMock).toHaveBeenCalledTimes(2);
  });
});
