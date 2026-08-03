import { execFileSync } from 'node:child_process';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeStarters from '@/renderer/pages/guid/components/HomeStarters';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';

const mocks = vi.hoisted(() => ({
  appState: {} as Record<string, unknown>,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const APP_FIXTURE_ROOT = process.env.OPL_APP_ROOT?.trim() ?? '';
const FAST_FIXTURE = 'contracts/fixtures/opl-app-state-fast.fixture.json';
const UNKNOWN_AGENT_FIXTURE = 'contracts/fixtures/opl-app-state-unknown-agent.fixture.json';

function readCanonicalFixture(relativePath: string): Record<string, unknown> {
  if (!APP_FIXTURE_ROOT) throw new Error('OPL_APP_ROOT is required for the App-owned cross-fixture tests.');
  const bytes = execFileSync('git', ['-C', APP_FIXTURE_ROOT, 'show', `origin/main:${relativePath}`], {
    encoding: 'utf8',
  });
  const parsed: unknown = JSON.parse(bytes);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`App fixture ${relativePath} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

describe.skipIf(!APP_FIXTURE_ROOT)('App-owned app-state fixture Home surfaces', () => {
  beforeEach(() => {
    mocks.appState = {};
  });

  it('does not synthesize fixed Shell starters from the fast fixture', () => {
    const fixture = readCanonicalFixture(FAST_FIXTURE);
    mocks.appState = fixture;
    const assistants = resolveOplHomeAssistants([], fixture);

    expect(assistants).toEqual([]);
    render(<HomeStarters assistants={assistants} localeKey='en-US' onSelect={vi.fn()} />);
    expect(screen.queryByTestId('opl-home-starters')).not.toBeInTheDocument();
  });

  it('renders the dynamically projected unknown Agent shortcut with its ready launch gate', async () => {
    const fixture = readCanonicalFixture(UNKNOWN_AGENT_FIXTURE);
    mocks.appState = fixture;
    const assistants = resolveOplHomeAssistants([], fixture);
    const onSelect = vi.fn();

    render(<HomeStarters assistants={assistants} localeKey='en-US' onSelect={onSelect} />);

    const starter = screen.getByTestId('home-starter-future-main');
    expect(starter).toHaveTextContent('Start Future Research');
    expect(starter).toHaveAttribute('data-opl-package-id', 'future.agent-lab');
    expect(starter).toHaveAttribute('data-opl-launch-ready', 'true');
    expect(starter).not.toHaveAttribute('title');

    await userEvent.click(starter);
    expect(onSelect).toHaveBeenCalledWith('future-main');
  });
});
