import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConversationSkillsIndicator from '@/renderer/pages/conversation/components/ConversationSkillsIndicator';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [] }),
}));

describe('ConversationSkillsIndicator OPL ordinary whitelist', () => {
  it('counts and displays only OPL ordinary skills from the conversation snapshot', () => {
    render(
      <ConversationSkillsIndicator
        conversation={
          {
            id: 'c1',
            name: 'test',
            created_at: 1,
            modified_at: 1,
            type: 'acp',
            model: {},
            extra: {
              skills: ['aionui-skills', 'mas', 'cron', 'rca'],
            },
          } as never
        }
      />
    );

    expect(screen.getByTestId('skills-indicator-count')).toHaveTextContent('2');
  });

  it('renders nothing when the snapshot only contains AionUI implementation skills', () => {
    render(
      <ConversationSkillsIndicator
        conversation={
          {
            id: 'c1',
            name: 'test',
            created_at: 1,
            modified_at: 1,
            type: 'acp',
            model: {},
            extra: {
              skills: ['aionui-skills', 'cron', 'skill-creator'],
            },
          } as never
        }
      />
    );

    expect(screen.queryByTestId('skills-indicator')).not.toBeInTheDocument();
  });
});
