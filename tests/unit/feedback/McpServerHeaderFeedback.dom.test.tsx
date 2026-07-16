/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies McpServerHeader only renders the FeedbackButton when the server
 * status is 'error', and that it is wired to module=mcp-tools.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const openFeedbackMock = vi.fn(() => Promise.resolve());
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: openFeedbackMock }),
}));

import McpServerHeader, { McpServerActions } from '@/renderer/pages/settings/ToolsSettings/McpServerHeader';
import McpServerItem from '@/renderer/pages/settings/ToolsSettings/McpServerItem';
import type { IMcpServer } from '@/common/config/storage';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';

const buildServer = (last_test_status: IMcpServer['last_test_status']): IMcpServer =>
  ({
    id: 's1',
    name: 'my-server',
    enabled: true,
    transport: { type: 'http', url: 'http://example' },
    last_test_status,
    created_at: 0,
    updated_at: 0,
    original_json: '',
  }) as IMcpServer;

const commonProps = {
  isTestingConnection: false,
  onTestConnection: vi.fn(),
  onEditServer: vi.fn(),
  onDeleteServer: vi.fn(),
};

const renderHeader = (last_test_status: IMcpServer['last_test_status']) =>
  render(
    <ConfigProvider>
      <McpServerHeader server={buildServer(last_test_status)} isTestingConnection={false} />
    </ConfigProvider>
  );

const renderActions = (last_test_status: IMcpServer['last_test_status']) =>
  render(
    <ConfigProvider>
      <McpServerActions server={buildServer(last_test_status)} {...commonProps} />
    </ConfigProvider>
  );

interface RenderServerItemOptions {
  server?: IMcpServer;
  onToggleCollapse?: () => void;
  onTestConnection?: (server: IMcpServer) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
  oauthStatus?: McpOAuthStatus;
}

const renderServerItem = ({
  server = {
    ...buildServer('connected'),
    tools: [
      {
        name: 'read_file',
        description: 'Read a file from the workspace',
        inputSchema: {},
      },
      {
        name: 'write_file',
        description: 'Write a file in the workspace',
        inputSchema: {},
      },
    ],
  },
  onToggleCollapse = vi.fn(),
  onTestConnection = commonProps.onTestConnection,
  onOAuthLogin,
  oauthStatus,
}: RenderServerItemOptions = {}) =>
  render(
    <ConfigProvider>
      <McpServerItem
        server={server}
        isCollapsed
        {...commonProps}
        oauthStatus={oauthStatus}
        onToggleCollapse={onToggleCollapse}
        onTestConnection={onTestConnection}
        onOAuthLogin={onOAuthLogin}
      />
    </ConfigProvider>
  );

describe('McpServerHeader — FeedbackButton wiring', () => {
  beforeEach(() => {
    openFeedbackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render FeedbackButton on connected status', () => {
    renderActions('connected');
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('does not render FeedbackButton while testing', () => {
    renderActions('testing');
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('renders FeedbackButton when server status is error', () => {
    renderActions('error');
    expect(screen.getByText('settings.oneClickFeedback')).toBeInTheDocument();
  });

  it('click opens feedback with module=mcp-tools', async () => {
    const user = userEvent.setup();
    renderActions('error');
    await user.click(screen.getByText('settings.oneClickFeedback'));

    expect(openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(openFeedbackMock).toHaveBeenCalledWith({
      module: 'mcp-tools',
      autoScreenshot: true,
    });
  });

  it('uses a compact monochrome outline status icon', () => {
    renderHeader('connected');

    const status = screen.getByRole('img', { name: 'settings.mcpCheckPassedSimple' });
    const icon = status.querySelector('svg');
    expect(icon).toHaveAttribute('width', '16');
    expect(icon).toHaveAttribute('height', '16');
    expect(status).toHaveClass('text-t-secondary');
  });

  it('uses the outline login icon instead of a text warning triangle', () => {
    const { container } = render(
      <ConfigProvider>
        <McpServerHeader
          server={buildServer(undefined)}
          isTestingConnection={false}
          oauthStatus={{ isAuthenticated: false, needsLogin: true, isChecking: false }}
        />
      </ConfigProvider>
    );

    const status = screen.getByRole('img', { name: 'settings.mcpNeedsLogin' });
    expect(status.querySelector('svg')).toHaveAttribute('width', '16');
    expect(container).not.toHaveTextContent('△');
  });

  it('opens error details from the keyboard and closes them with Escape', async () => {
    const user = userEvent.setup();
    const updatedAt = Date.UTC(2026, 6, 16, 8, 30);
    const onToggleCollapse = vi.fn();
    renderServerItem({
      server: { ...buildServer('error'), updated_at: updatedAt },
      onToggleCollapse,
    });

    const detailsTrigger = screen.getByRole('button', { name: 'settings.mcpCheckFailedSimple' });
    detailsTrigger.focus();
    expect(detailsTrigger).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(detailsTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toHaveTextContent('settings.mcpInlineConfigHint');
    expect(screen.getByRole('dialog')).toHaveTextContent('settings.mcpCheckedAtLabel');
    expect(screen.getByRole('dialog')).toHaveTextContent(new Date(updatedAt).toLocaleString());
    expect(onToggleCollapse).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(detailsTrigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.keyboard(' ');
    expect(detailsTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onToggleCollapse).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(detailsTrigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it('keeps actions outside the collapse title and keyboard reachable', async () => {
    const user = userEvent.setup();
    const { container } = renderServerItem();

    const checkButton = screen.getByRole('button', { name: 'settings.mcpTestConnection' });
    const actionsButton = screen.getByRole('button', { name: 'settings.mcpEditServer' });
    const actions = screen.getByTestId('mcp-server-actions');
    const collapseTitle = container.querySelector('.arco-collapse-item-header-title');
    const collapseExtra = container.querySelector('.arco-collapse-item-header-extra');

    expect(collapseTitle?.querySelector('button')).not.toBeInTheDocument();
    expect(collapseExtra).toContainElement(actions);
    expect(actions).not.toHaveClass('invisible');
    expect(actions).not.toHaveClass('hidden');
    await user.tab();
    expect(container.querySelector('.arco-collapse-item-header')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'settings.mcpCheckPassedSimple' })).toHaveFocus();
    await user.tab();
    expect(checkButton).toHaveFocus();
    await user.tab();
    expect(actionsButton).toHaveFocus();
  });

  it('does not toggle the disclosure when connection actions are clicked or keyboard activated', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const onTestConnection = vi.fn();
    renderServerItem({ onToggleCollapse, onTestConnection });

    const checkButton = screen.getByRole('button', { name: 'settings.mcpTestConnection' });
    await user.click(checkButton);
    checkButton.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onTestConnection).toHaveBeenCalledTimes(3);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it('does not toggle the disclosure when login is clicked or keyboard activated', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const onOAuthLogin = vi.fn();
    renderServerItem({
      server: buildServer(undefined),
      onToggleCollapse,
      onOAuthLogin,
      oauthStatus: { isAuthenticated: false, needsLogin: true, isChecking: false },
    });

    const loginButton = screen.getByRole('button', { name: 'settings.mcpLogin' });
    await user.click(loginButton);
    loginButton.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onOAuthLogin).toHaveBeenCalledTimes(3);
    expect(onToggleCollapse).not.toHaveBeenCalled();
  });

  it('renders the server and its tools as borderless collapse and flat hairline rows', () => {
    const { container } = renderServerItem();

    expect(container.querySelector('.arco-collapse')).toHaveClass('arco-collapse-borderless');
    const list = screen.getByTestId('mcp-server-tools-list');
    expect(list).toHaveClass('divide-y', 'border-t');
    expect(screen.getAllByTestId('mcp-server-tool-row')).toHaveLength(2);
    expect(list.querySelector('.border-2')).not.toBeInTheDocument();
    expect(list.querySelector('.bg-bg-2')).not.toBeInTheDocument();
    expect(list.querySelector('.rounded-lg')).not.toBeInTheDocument();
  });
});
