import type { IMcpServer } from '@/common/config/storage';
import { Button, Dropdown, Menu, Popover, Tooltip } from '@arco-design/web-react';
import { Check, CloseSmall, Info, LoadingOne, Refresh, Write, DeleteFour, SettingOne, Login } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';

interface McpServerHeaderProps {
  server: IMcpServer;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
}

interface McpServerActionsProps extends McpServerHeaderProps {
  isLoggingIn?: boolean;
  /** Extension-contributed servers are read-only */
  isReadOnly?: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

const getStatusIcon = (
  last_test_status?: IMcpServer['last_test_status'],
  oauthStatus?: McpOAuthStatus,
  isTestingConnection?: boolean
) => {
  if (isTestingConnection || last_test_status === 'testing' || oauthStatus?.isChecking) {
    return <LoadingOne theme='outline' size='16' fill='currentColor' className='animate-spin' />;
  }

  if (last_test_status === 'error') {
    return <CloseSmall theme='outline' size='16' fill='currentColor' />;
  }

  if (oauthStatus?.needsLogin) {
    return <Login theme='outline' size='16' fill='currentColor' />;
  }

  if (last_test_status === 'connected') {
    return <Check theme='outline' size='16' fill='currentColor' />;
  }

  if (oauthStatus?.isAuthenticated) {
    return <Check theme='outline' size='16' fill='currentColor' />;
  }

  return <Info theme='outline' size='16' fill='currentColor' />;
};

const formatStatusTimestamp = (timestamp?: number): string | null => {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
};

const getStatusPopoverContent = (
  server: IMcpServer,
  t?: (key: string, options?: Record<string, unknown>) => string
) => {
  if (server.last_test_status !== 'error' && server.last_test_status !== 'connected') {
    return null;
  }

  if (server.last_test_status === 'connected') {
    const checkedAt = formatStatusTimestamp(server.last_connected || server.updated_at);
    return (
      <div
        className='max-w-300px space-y-2 text-13px leading-20px'
        role='dialog'
        aria-label={t?.('settings.mcpCheckPassedSummary') || 'Manual check passed'}
      >
        <div className='font-medium text-t-primary'>
          {t?.('settings.mcpCheckPassedSummary') || 'Manual check passed'}
        </div>
        {checkedAt ? (
          <div className='text-12px leading-18px text-t-secondary'>{`${t?.('settings.mcpCheckedAtLabel') || 'Checked at:'} ${checkedAt}`}</div>
        ) : null}
        <div className='text-12px leading-18px text-t-secondary opacity-80'>
          {t?.('settings.mcpCheckPurposeHint') ||
            'Used to verify whether the MCP configuration is available. It does not represent the real-time status in the current conversation.'}
        </div>
      </div>
    );
  }

  const checkedAt = formatStatusTimestamp(server.updated_at);

  const reasonText =
    server.builtin && server.name === 'chrome-devtools' && server.transport.type === 'stdio'
      ? t?.('settings.mcpInlineCommandHint', {
          command: server.transport.command,
        }) || `Missing ${server.transport.command}. Install it and test again.`
      : t?.('settings.mcpInlineConfigHint') || 'Configuration may be incorrect. Review the MCP JSON and test again.';

  return (
    <div
      className='max-w-300px space-y-2 text-13px leading-20px'
      role='dialog'
      aria-label={t?.('settings.mcpCheckFailedSummary') || 'Manual check failed'}
    >
      <div className='font-medium text-t-primary'>{t?.('settings.mcpCheckFailedSummary') || 'Manual check failed'}</div>
      <div className='text-t-primary'>{reasonText}</div>
      {checkedAt ? (
        <div className='text-12px leading-18px text-t-secondary'>{`${t?.('settings.mcpCheckedAtLabel') || 'Checked at:'} ${checkedAt}`}</div>
      ) : null}
    </div>
  );
};

const getStatusText = (
  server: IMcpServer,
  last_test_status?: IMcpServer['last_test_status'],
  oauthStatus?: McpOAuthStatus,
  isTestingConnection?: boolean,
  t?: (key: string, options?: Record<string, unknown>) => string
) => {
  if (isTestingConnection || last_test_status === 'testing' || oauthStatus?.isChecking) {
    return t?.('settings.mcpTesting') || 'testing';
  }

  if (last_test_status === 'error') {
    if (server.builtin && server.name === 'chrome-devtools' && server.transport.type === 'stdio') {
      return (
        t?.('settings.mcpLocalCommandUnavailable', {
          command: server.transport.command,
        }) || `Requires ${server.transport.command} on this machine`
      );
    }
    return t?.('settings.mcpCheckFailedSimple') || 'Failed';
  }

  if (oauthStatus?.needsLogin) {
    return t?.('settings.mcpNeedsLogin') || 'Login required';
  }

  if (last_test_status === 'connected') {
    return t?.('settings.mcpCheckPassedSimple') || 'Manual check passed';
  }

  if (oauthStatus?.isAuthenticated) {
    return t?.('settings.mcpAuthenticated') || 'Authenticated';
  }

  return t?.('settings.mcpDisconnected') || 'Not tested';
};

const supportsOAuth = (server: IMcpServer) =>
  server.transport.type === 'http' || server.transport.type === 'sse' || server.transport.type === 'streamable_http';

const McpServerHeader: React.FC<McpServerHeaderProps> = ({ server, isTestingConnection, oauthStatus }) => {
  const { t } = useTranslation();
  const [statusDetailsVisible, setStatusDetailsVisible] = React.useState(false);

  const statusText = getStatusText(server, server.last_test_status, oauthStatus, isTestingConnection, t);
  const statusIcon = getStatusIcon(server.last_test_status, oauthStatus, isTestingConnection);
  const statusPopoverContent = getStatusPopoverContent(server, t);

  const statusIndicator = (
    <span
      className='flex min-w-0 items-center gap-5px text-t-secondary'
      role='img'
      aria-label={typeof statusText === 'string' ? statusText : undefined}
    >
      <span className='flex size-16px shrink-0 items-center justify-center leading-none' aria-hidden='true'>
        {statusIcon}
      </span>
      <span className='hidden max-w-180px truncate text-12px leading-18px sm:inline'>{statusText}</span>
    </span>
  );

  const toggleStatusDetails = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    setStatusDetailsVisible((visible) => !visible);
  };

  const handleStatusDetailsKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      setStatusDetailsVisible((visible) => !visible);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setStatusDetailsVisible(false);
    }
  };

  return (
    <div className='flex min-w-0 items-center gap-8px'>
      <span className='min-w-0 truncate text-13px font-600 leading-18px text-t-primary'>{server.name}</span>
      {statusPopoverContent ? (
        <Popover
          content={statusPopoverContent}
          trigger='hover'
          position='top'
          popupVisible={statusDetailsVisible}
          onVisibleChange={setStatusDetailsVisible}
        >
          <span
            className='flex min-w-0 cursor-pointer items-center rounded-4px outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
            role='button'
            tabIndex={0}
            aria-label={typeof statusText === 'string' ? statusText : undefined}
            aria-haspopup='dialog'
            aria-expanded={statusDetailsVisible}
            onClick={toggleStatusDetails}
            onKeyDown={handleStatusDetailsKeyDown}
            onBlur={() => setStatusDetailsVisible(false)}
          >
            {statusIndicator}
          </span>
        </Popover>
      ) : (
        <Tooltip content={statusText} position='top'>
          <span className='flex min-w-0 cursor-default items-center'>{statusIndicator}</span>
        </Tooltip>
      )}
    </div>
  );
};

export const McpServerActions: React.FC<McpServerActionsProps> = ({
  server,
  isTestingConnection,
  oauthStatus,
  isLoggingIn,
  isReadOnly,
  onTestConnection,
  onEditServer,
  onDeleteServer,
  onOAuthLogin,
}) => {
  const { t } = useTranslation();
  const needsLogin = supportsOAuth(server) && oauthStatus?.needsLogin;
  const isError = server.last_test_status === 'error';

  return (
    <div
      className='flex shrink-0 items-center gap-4px'
      data-testid='mcp-server-actions'
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {isError && <FeedbackButton module='mcp-tools' />}
      {!isReadOnly && (
        <>
          {needsLogin && onOAuthLogin ? (
            <Button
              size='mini'
              type='text'
              icon={<Login theme='outline' size='14' fill='currentColor' />}
              title={t('settings.mcpLogin') || 'Login'}
              aria-label={t('settings.mcpLogin') || 'Login'}
              loading={isLoggingIn}
              onClick={() => onOAuthLogin(server)}
            >
              {t('settings.mcpLogin') || 'Login'}
            </Button>
          ) : (
            <Button
              size='mini'
              type='text'
              shape='circle'
              className='!size-28px !p-0 text-t-secondary'
              icon={<Refresh theme='outline' size='14' fill='currentColor' />}
              title={t('settings.mcpTestConnection')}
              aria-label={t('settings.mcpTestConnection')}
              loading={isTestingConnection}
              onClick={() => onTestConnection(server)}
            />
          )}
          {!server.builtin && (
            <Dropdown
              trigger='click'
              position='br'
              droplist={
                <Menu>
                  <Menu.Item key='edit' onClick={() => onEditServer(server)}>
                    <div className='flex items-center gap-2'>
                      <Write theme='outline' size='14' fill='currentColor' />
                      {t('settings.mcpEditServer')}
                    </div>
                  </Menu.Item>
                  <Menu.Item key='delete' onClick={() => onDeleteServer(server.id)}>
                    <div className='flex items-center gap-2 text-red-500'>
                      <DeleteFour theme='outline' size='14' fill='currentColor' />
                      {t('settings.mcpDeleteServer')}
                    </div>
                  </Menu.Item>
                </Menu>
              }
            >
              <Button
                size='mini'
                type='text'
                shape='circle'
                className='!size-28px !p-0 text-t-secondary'
                icon={<SettingOne theme='outline' size='14' fill='currentColor' />}
                title={t('settings.mcpEditServer')}
                aria-label={t('settings.mcpEditServer')}
              />
            </Dropdown>
          )}
        </>
      )}
    </div>
  );
};

export default McpServerHeader;
