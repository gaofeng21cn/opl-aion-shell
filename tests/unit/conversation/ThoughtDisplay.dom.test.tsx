import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'conversation.chat.processing': '正在处理',
        'common.unit.second_short': 's',
        'common.unit.minute_short': 'm',
      };
      return labels[key] ?? String(options?.defaultValue ?? key);
    },
  }),
}));

describe('ThoughtDisplay elapsed processing indicator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows elapsed seconds while running without thought text', () => {
    vi.useFakeTimers();

    render(<ThoughtDisplay running />);

    expect(screen.getByText(/正在处理/)).toBeInTheDocument();
    expect(screen.getByText('(0s)')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('(3s)')).toBeInTheDocument();
  });
});
