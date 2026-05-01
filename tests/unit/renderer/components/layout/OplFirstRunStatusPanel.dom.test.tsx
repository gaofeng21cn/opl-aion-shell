import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OplFirstRunStatusPanel } from '@/renderer/components/layout/Layout';
import { OplFirstRunWizard } from '@/renderer/components/layout/OplFirstRunWizard';

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

describe('OplFirstRunWizard', () => {
  it('renders the independent Codex configuration step with stable automation labels', async () => {
    const onConfigureCodex = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const onOpenEnvironment = vi.fn();

    render(
      <OplFirstRunWizard
        state={{
          status: 'codex-config-needed',
          message: 'Configure Codex API key',
          blockers: ['codex_config', 'domain_modules'],
          codexDefaultProfile: {
            model_provider: 'gflab',
            provider_name: 'gflab',
            model: 'gpt-5.5',
            model_reasoning_effort: 'xhigh',
            base_url: 'https://gflabtoken.cn/v1',
            base_url_role: 'product_default_provider_endpoint',
            model_profile_role: 'maintainer_current_initial_profile',
          },
        }}
        onConfigureCodex={onConfigureCodex}
        onRetry={onRetry}
        onOpenEnvironment={onOpenEnvironment}
        t={t}
      />
    );

    expect(screen.getByTestId('opl-first-run-window')).toHaveAttribute('aria-label', 'opl-first-run-window');
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('Configure Codex API key');
    expect(screen.getByText(/settings\.oplFirstLaunch\.codex\.providerEndpoint/)).toBeInTheDocument();
    expect(screen.getByText(/settings\.oplFirstLaunch\.codex\.initialModelProfile/)).toBeInTheDocument();
    expect(screen.getByText(/gflab/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-5\.5/)).toBeInTheDocument();
    expect(screen.getByText(/xhigh/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/gflabtoken\.cn\/v1/)).toBeInTheDocument();

    const input = screen.getByTestId('opl-first-run-codex-api-key-input').querySelector('input');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('aria-label', 'opl-first-run-codex-api-key-input');
    await userEvent.type(input!, 'secret-api-key');
    await userEvent.click(screen.getByTestId('opl-first-run-configure-codex-button'));

    expect(onConfigureCodex).toHaveBeenCalledWith('secret-api-key');
    expect(screen.getByTestId('opl-first-run-retry-button')).toHaveAttribute('aria-label', 'opl-first-run-retry-button');
  });
});
