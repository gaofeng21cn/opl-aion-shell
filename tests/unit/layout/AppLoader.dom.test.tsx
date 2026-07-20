import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AppLoader from '@/renderer/components/layout/AppLoader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AppLoader', () => {
  it('exposes a visible startup preflight state instead of an empty renderer', () => {
    render(
      <AppLoader
        brand='One Person Lab'
        title='common.uiOptimization.startup.title'
        description='common.startupPreflight.description'
        testId='opl-startup-preflight'
        details='Delayed startup details'
        detailsLabel='common.uiOptimization.startup.viewDetails'
        steps={[
          { label: 'common.uiOptimization.startup.stages.workspace', state: 'complete' },
          { label: 'common.uiOptimization.startup.stages.assistant', state: 'active' },
          { label: 'common.uiOptimization.startup.stages.modelAccess', state: 'pending' },
        ]}
      />
    );

    expect(screen.getByTestId('opl-startup-preflight')).toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent('One Person Lab');
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent('common.uiOptimization.startup.title');
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent(
      'common.uiOptimization.startup.stages.workspace'
    );
    expect(screen.getByTestId('opl-startup-preflight')).not.toHaveTextContent('%');
    expect(screen.queryByText('Delayed startup details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.uiOptimization.startup.viewDetails' }));
    expect(screen.getByText('Delayed startup details')).toBeInTheDocument();
  });

  it('shows a percentage only when the active stage reports reliable progress', () => {
    const { rerender } = render(
      <AppLoader steps={[{ label: 'Workspace', state: 'active' }]} showProgress testId='progress-loader' />
    );
    expect(screen.getByTestId('progress-loader')).not.toHaveTextContent('%');

    rerender(
      <AppLoader
        steps={[{ label: 'Workspace', state: 'active', progress: 42 }]}
        showProgress
        progressIsReliable
        testId='progress-loader'
      />
    );
    expect(screen.getByTestId('progress-loader')).toHaveTextContent('42%');
  });
});
