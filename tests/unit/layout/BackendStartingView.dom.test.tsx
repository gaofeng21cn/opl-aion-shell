import BackendStartingView from '@/renderer/components/layout/BackendStartingView';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const copy: Record<string, string> = {
  'common.backendStartup.pendingSlow.title': 'Starting local service',
  'common.backendStartup.pendingSlow.description':
    'The One Person Lab local service is still starting. Please wait; the app will continue automatically when it is ready.',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => copy[key] ?? key }),
}));

describe('BackendStartingView', () => {
  it('shows benign progress without failure actions or reinstall guidance', () => {
    render(<BackendStartingView />);

    const description = screen.getByTestId('backend-starting-description').textContent?.toLowerCase() ?? '';
    expect(description).not.toContain('reinstall');
    expect(description).not.toContain('antivirus');
    expect(description).not.toContain('quarantine');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
