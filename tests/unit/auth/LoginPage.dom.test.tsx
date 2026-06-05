import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/renderer/pages/login';

const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  status: 'checking' as 'checking' | 'authenticated' | 'unauthenticated',
  login: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('LoginPage desktop entry routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'checking';
    authState.login.mockResolvedValue({ success: true });
    window.localStorage.clear();
  });

  it('sends already-authenticated desktop users to the first-run surface', async () => {
    authState.status = 'authenticated';

    render(<LoginPage />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/first-run', { replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith('/guid', expect.anything());
  });

  it('sends successful login users to the first-run surface', async () => {
    authState.status = 'unauthenticated';

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    await waitFor(() =>
      expect(authState.login).toHaveBeenCalledWith({ username: 'admin', password: 'password', remember: false })
    );

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/first-run', { replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith('/guid', expect.anything());
  });
});
