import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/renderer/pages/login';

const navigateMock = vi.hoisted(() => vi.fn());
const changeLanguageMock = vi.hoisted(() => vi.fn(async () => undefined));
const authState = vi.hoisted(() => ({
  status: 'checking' as 'checking' | 'authenticated' | 'unauthenticated',
  login: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: changeLanguageMock,
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

const encodeRememberedValue = (value: string): string => {
  return btoa(encodeURIComponent(value)).split('').toReversed().join('');
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'checking';
    authState.login.mockResolvedValue({ success: true });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends already-authenticated desktop users directly to Guid', async () => {
    authState.status = 'authenticated';

    render(<LoginPage />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/guid', { replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith('/startup-gate', expect.anything());
  });

  it('sends successful login users to Guid with a one-shot setup check', async () => {
    authState.status = 'unauthenticated';

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    await waitFor(() =>
      expect(authState.login).toHaveBeenCalledWith({ username: 'admin', password: 'password', remember: false })
    );

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/guid', {
        replace: true,
        state: { postLoginSetupCheck: true },
      })
    );
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalledWith('/startup-gate', expect.anything());
  });

  it('removes a legacy remembered password without hydrating it', async () => {
    authState.status = 'unauthenticated';
    window.localStorage.setItem('rememberMe', 'true');
    window.localStorage.setItem('rememberedUsername', encodeRememberedValue('admin'));
    window.localStorage.setItem('rememberedPassword', encodeRememberedValue('legacy-password'));

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText('login.username')).toHaveValue('admin'));
    expect(screen.getByLabelText('login.password')).toHaveValue('');
    expect(screen.getByLabelText('login.rememberMe')).toBeChecked();
    expect(window.localStorage.getItem('rememberedPassword')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('login.password')).toHaveFocus());
  });

  it('persists only the username and session intent when remembering an account', async () => {
    authState.status = 'unauthenticated';
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByLabelText('login.rememberMe'));
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    await waitFor(() =>
      expect(authState.login).toHaveBeenCalledWith({ username: 'admin', password: 'password', remember: true })
    );
    await waitFor(() => expect(window.localStorage.getItem('rememberMe')).toBe('true'));
    expect(window.localStorage.getItem('rememberedUsername')).toBe(encodeRememberedValue('admin'));
    expect(window.localStorage.getItem('rememberedPassword')).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalledWith('rememberedPassword', expect.any(String));
  });

  it('exposes language and password controls with keyboard-readable state', () => {
    authState.status = 'unauthenticated';

    render(<LoginPage />);

    expect(screen.getByRole('combobox', { name: 'login.languageToggle' })).toBeInTheDocument();
    const passwordInput = screen.getByLabelText('login.password');
    const toggle = screen.getByRole('button', { name: 'login.showPassword' });

    expect(toggle).toHaveAttribute('aria-controls', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'login.hidePassword' })).toHaveAttribute('aria-pressed', 'true');
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('persists language only after a real selection that changes the current locale', () => {
    authState.status = 'unauthenticated';

    render(<LoginPage />);

    const languageSelect = screen.getByRole('combobox', { name: 'login.languageToggle' });
    expect(changeLanguageMock).not.toHaveBeenCalled();

    fireEvent.change(languageSelect, { target: { value: 'en-US' } });
    expect(changeLanguageMock).not.toHaveBeenCalled();

    fireEvent.change(languageSelect, { target: { value: 'zh-CN' } });
    expect(changeLanguageMock).toHaveBeenCalledOnce();
    expect(changeLanguageMock).toHaveBeenCalledWith('zh-CN');
  });

  it('announces validation errors and focuses the first invalid field', async () => {
    authState.status = 'unauthenticated';

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('login.errors.empty');
    const usernameInput = screen.getByLabelText('login.username');
    expect(usernameInput).toHaveFocus();
    expect(usernameInput).toHaveAttribute('aria-invalid', 'true');
    expect(usernameInput).toHaveAttribute('aria-describedby', 'login-message');
  });

  it('marks the form busy while authentication is pending', async () => {
    authState.status = 'unauthenticated';
    let resolveLogin: ((result: { success: boolean; code: string }) => void) | undefined;
    authState.login.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    const form = screen.getByRole('form', { name: 'login.submit' });
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('button', { name: 'login.submitting' })).toBeDisabled();

    resolveLogin?.({ success: false, code: 'invalidCredentials' });
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'false'));
  });
});
