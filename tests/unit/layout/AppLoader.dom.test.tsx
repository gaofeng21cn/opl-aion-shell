import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        title='common.startupPreflight.title'
        description='common.startupPreflight.description'
        testId='opl-startup-preflight'
        steps={[
          { label: 'common.startupPreflight.steps.desktopSession', state: 'complete' },
          { label: 'common.startupPreflight.steps.appConfig', state: 'active' },
          { label: 'common.startupPreflight.steps.firstRunStatus', state: 'pending' },
        ]}
      />
    );

    expect(screen.getByTestId('opl-startup-preflight')).toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent('common.startupPreflight.title');
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent(
      'common.startupPreflight.steps.desktopSession'
    );
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent('common.startupPreflight.steps.appConfig');
    expect(screen.getByTestId('opl-startup-preflight')).toHaveTextContent(
      'common.startupPreflight.steps.firstRunStatus'
    );
  });
});
