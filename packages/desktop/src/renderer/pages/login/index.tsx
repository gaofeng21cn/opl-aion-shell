import loginLogo from '@renderer/assets/logos/brand/app-login-logo.png';
import { LoadingOne, Lock, PreviewClose, PreviewOpen, Translate, User } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '../../hooks/context/AuthContext';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from '@/common/config/i18n';
import './LoginPage.css';

type MessageState = {
  type: 'error' | 'success';
  text: string;
  invalidFields?: 'username' | 'password' | 'credentials';
};

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const REMEMBERED_PASSWORD_KEY = 'rememberedPassword';

const encodeRememberedUsername = (username: string): string => {
  const encoded = btoa(encodeURIComponent(username));
  return encoded.split('').toReversed().join('');
};

const decodeRememberedUsername = (storedUsername: string): string => {
  try {
    const reversed = storedUsername.split('').toReversed().join('');
    return decodeURIComponent(atob(reversed));
  } catch {
    return '';
  }
};

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const messageTimer = useRef<number | undefined>(undefined);
  const focusTimer = useRef<number | undefined>(undefined);
  const navigationTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
      if (focusTimer.current) {
        window.clearTimeout(focusTimer.current);
      }
      if (navigationTimer.current) {
        window.clearTimeout(navigationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    document.title = t('login.pageTitle');
  }, [t]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    // Passwords were reversibly obfuscated by older builds. Never hydrate them and
    // remove the legacy value regardless of the current remember-me preference.
    localStorage.removeItem(REMEMBERED_PASSWORD_KEY);

    const isRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    let hasRememberedUsername = false;

    if (isRememberMe) {
      const storedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      const rememberedUsername = storedUsername ? decodeRememberedUsername(storedUsername) : '';
      if (rememberedUsername) {
        setUsername(rememberedUsername);
        hasRememberedUsername = true;
      }
      setRememberMe(true);
    } else {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }

    focusTimer.current = window.setTimeout(() => {
      if (hasRememberedUsername) {
        passwordRef.current?.focus();
      } else {
        usernameRef.current?.focus();
      }
    }, 0);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate('/startup-gate', { replace: true });
    }
  }, [navigate, status]);

  const clearMessageLater = useCallback(() => {
    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }
    messageTimer.current = window.setTimeout(() => {
      setMessage((prev) => (prev?.type === 'success' ? prev : null));
    }, 5000);
  }, []);

  const showMessage = useCallback(
    (next: MessageState) => {
      setMessage(next);
      if (next.type === 'error') {
        clearMessageLater();
      }
    },
    [clearMessageLater]
  );

  const supportedLanguages = useMemo<{ code: string; label: string }[]>(
    () => SUPPORTED_LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] ?? code })),
    []
  );

  const handleLanguageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;
    changeLanguage(nextLanguage).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (loading) return;

      const trimmedUsername = username.trim();

      if (!trimmedUsername) {
        showMessage({ type: 'error', text: t('login.errors.empty'), invalidFields: 'username' });
        usernameRef.current?.focus();
        return;
      }

      if (!password) {
        showMessage({ type: 'error', text: t('login.errors.empty'), invalidFields: 'password' });
        passwordRef.current?.focus();
        return;
      }

      setLoading(true);
      setMessage(null);

      try {
        const result = await login({ username: trimmedUsername, password, remember: rememberMe });

        if (result.success) {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_ME_KEY, 'true');
            localStorage.setItem(REMEMBERED_USERNAME_KEY, encodeRememberedUsername(trimmedUsername));
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
            localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          }
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);

          const successText = t('login.success');
          showMessage({ type: 'success', text: successText });

          navigationTimer.current = window.setTimeout(() => {
            void navigate('/startup-gate', { replace: true });
          }, 600);
        } else {
          const errorText = (() => {
            switch (result.code) {
              case 'invalidCredentials':
                return t('login.errors.invalidCredentials');
              case 'tooManyAttempts':
                return t('login.errors.tooManyAttempts');
              case 'networkError':
                return t('login.errors.networkError');
              case 'serverError':
                return t('login.errors.serverError');
              case 'unknown':
              default:
                return result.message ?? t('login.errors.unknown');
            }
          })();

          showMessage({
            type: 'error',
            text: errorText,
            invalidFields: result.code === 'invalidCredentials' ? 'credentials' : undefined,
          });
          passwordRef.current?.focus();
        }
      } catch {
        showMessage({ type: 'error', text: t('login.errors.networkError') });
        passwordRef.current?.focus();
      } finally {
        setLoading(false);
      }
    },
    [loading, login, navigate, password, rememberMe, showMessage, t, username]
  );

  if (status === 'checking') {
    return <AppLoader />;
  }

  const usernameInvalid =
    message?.type === 'error' && (message.invalidFields === 'username' || message.invalidFields === 'credentials');
  const passwordInvalid =
    message?.type === 'error' && (message.invalidFields === 'password' || message.invalidFields === 'credentials');

  return (
    <div className='login-page'>
      <div className='login-page__card'>
        <label className='login-page__lang-select-wrapper' htmlFor='lang-select'>
          <Translate className='login-page__lang-icon' aria-hidden='true' />
          <select
            id='lang-select'
            className='login-page__lang-select'
            value={i18n.language}
            onChange={handleLanguageChange}
            aria-label={t('login.languageToggle')}
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        <div className='login-page__header'>
          <div className='login-page__logo'>
            <img src={loginLogo} alt={t('login.brand')} />
          </div>
          <h1 className='login-page__title'>{t('login.brand')}</h1>
          <p className='login-page__subtitle'>{t('login.subtitle')}</p>
        </div>

        <form
          className='login-page__form'
          onSubmit={handleSubmit}
          aria-label={t('login.submit')}
          aria-busy={loading}
          noValidate
        >
          <div className='login-page__form-item'>
            <label className='login-page__label' htmlFor='username'>
              {t('login.username')}
            </label>
            <div className='login-page__input-wrapper'>
              <User className='login-page__input-icon' aria-hidden='true' />
              <input
                ref={usernameRef}
                id='username'
                name='username'
                className='login-page__input'
                placeholder={t('login.usernamePlaceholder')}
                autoComplete='username'
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (message?.type === 'error') setMessage(null);
                }}
                aria-required='true'
                aria-invalid={usernameInvalid}
                aria-describedby={message?.type === 'error' ? 'login-message' : undefined}
              />
            </div>
          </div>

          <div className='login-page__form-item'>
            <label className='login-page__label' htmlFor='password'>
              {t('login.password')}
            </label>
            <div className='login-page__input-wrapper'>
              <Lock className='login-page__input-icon' aria-hidden='true' />
              <input
                ref={passwordRef}
                id='password'
                name='password'
                type={passwordVisible ? 'text' : 'password'}
                className='login-page__input'
                placeholder={t('login.passwordPlaceholder')}
                autoComplete='current-password'
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (message?.type === 'error') setMessage(null);
                }}
                aria-required='true'
                aria-invalid={passwordInvalid}
                aria-describedby={message?.type === 'error' ? 'login-message' : undefined}
              />
              <button
                type='button'
                className='login-page__toggle-password'
                onClick={() => setPasswordVisible((prev) => !prev)}
                aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
                aria-controls='password'
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? (
                  <PreviewClose className='login-page__toggle-icon' aria-hidden='true' />
                ) : (
                  <PreviewOpen className='login-page__toggle-icon' aria-hidden='true' />
                )}
              </button>
            </div>
          </div>

          <div className='login-page__checkbox'>
            <input
              type='checkbox'
              id='remember-me'
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <label htmlFor='remember-me'>{t('login.rememberMe')}</label>
          </div>

          <button type='submit' className='login-page__submit' disabled={loading}>
            {loading && <LoadingOne className='login-page__spinner' aria-hidden='true' />}
            <span>{loading ? t('login.submitting') : t('login.submit')}</span>
          </button>

          {message && (
            <div
              id='login-message'
              role={message.type === 'error' ? 'alert' : 'status'}
              aria-live={message.type === 'error' ? 'assertive' : 'polite'}
              className={`login-page__message login-page__message--${message.type}`}
            >
              {message.text}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
