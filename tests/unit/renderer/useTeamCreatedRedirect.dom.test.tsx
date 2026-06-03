import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTeamCreatedRedirect } from '@/renderer/pages/team/hooks/useTeamCreatedRedirect';
import { ipcBridge } from '@/common';

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/guid' }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      listChanged: { on: vi.fn() },
      created: { on: vi.fn() },
    },
  },
}));

describe('useTeamCreatedRedirect', () => {
  it('does not subscribe to Team-created events when Team mode is disabled', () => {
    renderHook(() => useTeamCreatedRedirect());

    expect(ipcBridge.team.listChanged.on).not.toHaveBeenCalled();
    expect(ipcBridge.team.created.on).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
