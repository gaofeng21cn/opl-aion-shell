/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * White-box tests for FeedbackReportModal's prefill behavior.
 * Verifies that defaultModule + prefilledScreenshots props seed the form
 * when the modal becomes visible, and that cancel clears the form.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider, Message } from '@arco-design/web-react';

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const sentryMocks = vi.hoisted(() => {
  const setTag = vi.fn();
  const flush = vi.fn(async () => true);
  return {
    setTag,
    flush,
    captureEvent: vi.fn(() => 'feedback-event-id'),
    getClient: vi.fn(() => ({ flush })),
    withScope: vi.fn((callback: (scope: { setTag: typeof setTag }) => unknown) => {
      return callback({ setTag });
    }),
  };
});

vi.mock('@sentry/electron/renderer', () => sentryMocks);

import FeedbackReportModal, {
  type PrefilledScreenshot,
} from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';

const renderModal = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

const deliveryAvailable = vi.fn(async () => true);
const collectFeedbackLogs = vi.fn(async () => ({ filename: 'logs.gz', data: [1, 2, 3] }));
const flushFeedbackDelivery = vi.fn(async () => true);

const installElectronApi = () => {
  (
    window as unknown as {
      electronAPI?: {
        isFeedbackDeliveryAvailable: typeof deliveryAvailable;
        collectFeedbackLogs: typeof collectFeedbackLogs;
        flushFeedbackDelivery: typeof flushFeedbackDelivery;
      };
    }
  ).electronAPI = {
    isFeedbackDeliveryAvailable: deliveryAvailable,
    collectFeedbackLogs,
    flushFeedbackDelivery,
  };
};

const submitReport = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('settings.bugReportDescriptionPlaceholder'), 'provider failed');
  await user.click(screen.getByText('settings.bugReportSubmit'));
};

const buildScreenshot = (name: string, byte: number): PrefilledScreenshot => ({
  filename: name,
  data: new Uint8Array([byte, byte + 1, byte + 2]),
  type: 'image/png',
});

describe('FeedbackReportModal — prefill', () => {
  beforeEach(() => {
    installElectronApi();
    deliveryAvailable.mockReset();
    deliveryAvailable.mockResolvedValue(true);
    collectFeedbackLogs.mockReset();
    collectFeedbackLogs.mockResolvedValue({ filename: 'logs.gz', data: [1, 2, 3] });
    flushFeedbackDelivery.mockReset();
    flushFeedbackDelivery.mockResolvedValue(true);
    sentryMocks.setTag.mockClear();
    sentryMocks.flush.mockReset();
    sentryMocks.flush.mockResolvedValue(true);
    sentryMocks.captureEvent.mockReset();
    sentryMocks.captureEvent.mockReturnValue('feedback-event-id');
    sentryMocks.getClient.mockClear();
    sentryMocks.withScope.mockClear();
    vi.mocked(Message.success).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render form content when visible=false', () => {
    renderModal(<FeedbackReportModal visible={false} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('feedback-report-scroll-body')).not.toBeInTheDocument();
  });

  it('renders the form body when visible=true', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} />);
    expect(screen.getByTestId('feedback-report-scroll-body')).toBeInTheDocument();
  });

  it('applies defaultModule on open, showing it as the selected option', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' />);
    // The select shows the i18n key (mock returns the key itself). That is how other
    // tests in this repo verify module labels with the t() → identity mock.
    expect(screen.getByText('settings.bugReportModuleMcp')).toBeInTheDocument();
  });

  it('seeds the Upload list with prefilled screenshots', () => {
    const shots = [buildScreenshot('shot-a.png', 1), buildScreenshot('shot-b.png', 10)];
    renderModal(
      <FeedbackReportModal
        visible={true}
        onCancel={vi.fn()}
        defaultModule='conversation-session'
        prefilledScreenshots={shots}
      />
    );

    // The picture-card Upload renders one .arco-upload-list-item per screenshot.
    // Arco also appends a separate `+` trigger until the 3-item limit is hit.
    expect(document.querySelectorAll('.arco-upload-list-item').length).toBe(2);
  });

  it('shows the uploaded count next to the screenshot label when seeded', () => {
    const shots = [buildScreenshot('a.png', 1), buildScreenshot('b.png', 2)];
    renderModal(
      <FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' prefilledScreenshots={shots} />
    );
    expect(screen.getByTestId('feedback-report-screenshot-count')).toBeInTheDocument();
  });

  it('hides the uploaded count when no screenshots are attached', () => {
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='mcp-tools' />);
    expect(screen.queryByTestId('feedback-report-screenshot-count')).not.toBeInTheDocument();
  });

  it('caps prefilled screenshots to the 3-item upload limit', () => {
    const shots = [
      buildScreenshot('a.png', 1),
      buildScreenshot('b.png', 2),
      buildScreenshot('c.png', 3),
      buildScreenshot('d.png', 4),
      buildScreenshot('e.png', 5),
    ];
    renderModal(
      <FeedbackReportModal
        visible={true}
        onCancel={vi.fn()}
        defaultModule='system-settings'
        prefilledScreenshots={shots}
      />
    );

    // Only the first 3 screenshots make it into the Upload list.
    expect(document.querySelectorAll('.arco-upload-list-item').length).toBe(3);
    // When the limit is hit Arco hides the `+` trigger tile.
    expect(document.querySelector('.arco-upload-trigger-picture')).toBeNull();
  });

  it('calls onCancel when the close button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderModal(<FeedbackReportModal visible={true} onCancel={onCancel} defaultModule='agent-detection' />);

    const closeBtn = document.querySelector('.aionui-modal-close-btn') as HTMLElement | null;
    expect(closeBtn).not.toBeNull();
    await user.click(closeBtn!);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits feedback tags and extra context to Sentry', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderModal(
      <FeedbackReportModal
        visible={true}
        onCancel={onCancel}
        defaultModule='conversation-session'
        feedbackTags={{
          agent_error_code: 'USER_LLM_PROVIDER_AUTH_FAILED',
          agent_error_ownership: 'user_llm_provider',
        }}
        feedbackExtra={{
          agent_error: {
            code: 'USER_LLM_PROVIDER_AUTH_FAILED',
            ownership: 'user_llm_provider',
          },
        }}
      />
    );

    await submitReport(user);

    await waitFor(() => {
      expect(sentryMocks.captureEvent).toHaveBeenCalledTimes(1);
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith('type', 'user-feedback');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('module', 'conversation-session');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('agent_error_code', 'USER_LLM_PROVIDER_AUTH_FAILED');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('agent_error_ownership', 'user_llm_provider');
    expect(sentryMocks.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: {
          description: 'provider failed',
          agent_error: {
            code: 'USER_LLM_PROVIDER_AUTH_FAILED',
            ownership: 'user_llm_provider',
          },
        },
      }),
      expect.objectContaining({ attachments: [] })
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('FeedbackReportModal — privacy and delivery', () => {
  beforeEach(() => {
    installElectronApi();
    deliveryAvailable.mockReset();
    deliveryAvailable.mockResolvedValue(true);
    collectFeedbackLogs.mockReset();
    collectFeedbackLogs.mockResolvedValue({ filename: 'logs.gz', data: [1, 2, 3] });
    flushFeedbackDelivery.mockReset();
    flushFeedbackDelivery.mockResolvedValue(true);
    sentryMocks.flush.mockReset();
    sentryMocks.flush.mockResolvedValue(true);
    sentryMocks.captureEvent.mockReset();
    sentryMocks.captureEvent.mockReturnValue('feedback-event-id');
    sentryMocks.getClient.mockClear();
    sentryMocks.withScope.mockClear();
    vi.mocked(Message.success).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps diagnostic logs off by default', async () => {
    const user = userEvent.setup();
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='conversation-session' />);

    await submitReport(user);

    await waitFor(() => expect(sentryMocks.captureEvent).toHaveBeenCalledTimes(1));
    expect(collectFeedbackLogs).not.toHaveBeenCalled();
    expect(sentryMocks.captureEvent).toHaveBeenCalledWith(expect.anything(), { attachments: [] });
  });

  it('collects diagnostic logs only after explicit opt-in', async () => {
    const user = userEvent.setup();
    renderModal(<FeedbackReportModal visible={true} onCancel={vi.fn()} defaultModule='conversation-session' />);

    await user.click(screen.getByTestId('feedback-report-include-logs'));
    await submitReport(user);

    await waitFor(() => expect(collectFeedbackLogs).toHaveBeenCalledTimes(1));
    expect(sentryMocks.captureEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: 'logs.gz',
            contentType: 'application/gzip',
          }),
        ],
      })
    );
  });

  it('does not report success when the delivery backend is unavailable', async () => {
    deliveryAvailable.mockResolvedValue(false);
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderModal(<FeedbackReportModal visible={true} onCancel={onCancel} defaultModule='conversation-session' />);

    await submitReport(user);

    expect(await screen.findByText('common.feedback.deliveryUnavailable')).toBeInTheDocument();
    expect(sentryMocks.captureEvent).not.toHaveBeenCalled();
    expect(sentryMocks.flush).not.toHaveBeenCalled();
    expect(flushFeedbackDelivery).not.toHaveBeenCalled();
    expect(Message.success).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not report success when Sentry cannot flush the event', async () => {
    flushFeedbackDelivery.mockResolvedValue(false);
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderModal(<FeedbackReportModal visible={true} onCancel={onCancel} defaultModule='conversation-session' />);

    await submitReport(user);

    expect(await screen.findByText('common.feedback.deliveryFailed')).toBeInTheDocument();
    expect(sentryMocks.captureEvent).toHaveBeenCalledTimes(1);
    expect(sentryMocks.flush).toHaveBeenCalledTimes(1);
    expect(flushFeedbackDelivery).toHaveBeenCalledTimes(1);
    expect(Message.success).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
