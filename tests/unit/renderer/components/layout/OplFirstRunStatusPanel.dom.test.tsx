import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OplFirstRunStatusPanel } from '@/renderer/components/layout/Layout';

const t = (key: string, options?: Record<string, string>) => `${key}${options?.path ? `:${options.path}` : ''}`;

describe('OplFirstRunStatusPanel', () => {
  it('renders stable first-run selectors and blocker status', async () => {
    const onInstall = vi.fn();
    const onOpenEnvironment = vi.fn();
    const onOpenModules = vi.fn();

    render(
      <OplFirstRunStatusPanel
        state={{
          status: 'setup-needed',
          message: 'Install domain modules',
          blockers: ['domain_modules'],
          logPath: '/Users/test/Library/Logs/One Person Lab/first-run.jsonl',
        }}
        onInstall={onInstall}
        onOpenEnvironment={onOpenEnvironment}
        onOpenModules={onOpenModules}
        t={t}
      />
    );

    expect(screen.getByTestId('opl-first-run-window')).toHaveAttribute('aria-label', 'opl-first-run-window');
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('Install domain modules');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('domain_modules');
    expect(screen.getByText(/first-run\.jsonl/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('opl-first-run-install-button'));
    await userEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));
    await userEvent.click(screen.getByTestId('opl-first-run-open-modules-button'));

    expect(onInstall).toHaveBeenCalledOnce();
    expect(onOpenEnvironment).toHaveBeenCalledOnce();
    expect(onOpenModules).toHaveBeenCalledOnce();
  });

  it('renders the ready entry when preparation is complete', () => {
    render(
      <OplFirstRunStatusPanel
        state={{ status: 'prepared', blockers: [] }}
        onInstall={vi.fn()}
        onOpenEnvironment={vi.fn()}
        onOpenModules={vi.fn()}
        t={t}
      />
    );

    expect(screen.getByTestId('opl-first-run-ready-entry')).toHaveAttribute(
      'aria-label',
      'opl-first-run-ready-entry'
    );
  });
});
