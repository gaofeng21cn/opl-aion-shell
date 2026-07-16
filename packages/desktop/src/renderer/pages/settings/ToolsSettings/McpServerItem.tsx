import { Collapse } from '@arco-design/web-react';
import React from 'react';
import type { IMcpServer } from '@/common/config/storage';
import McpServerHeader, { McpServerActions } from './McpServerHeader';
import McpServerToolsList from './McpServerToolsList';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';

interface McpServerItemProps {
  server: IMcpServer;
  isCollapsed: boolean;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
  isLoggingIn?: boolean;
  /** Extension-contributed servers are read-only (no edit/delete) */
  isReadOnly?: boolean;
  onToggleCollapse: () => void;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

const McpServerItem: React.FC<McpServerItemProps> = ({
  server,
  isCollapsed,
  isTestingConnection,
  oauthStatus,
  isLoggingIn,
  isReadOnly,
  onToggleCollapse,
  onTestConnection,
  onEditServer,
  onDeleteServer,
  onOAuthLogin,
}) => {
  return (
    <Collapse
      key={server.id}
      activeKey={isCollapsed ? ['1'] : []}
      onChange={onToggleCollapse}
      bordered={false}
      className='bg-transparent [&_.arco-collapse-item]:!border-0 [&_.arco-collapse-item-header]:!min-h-44px [&_.arco-collapse-item-header]:!bg-transparent [&_.arco-collapse-item-header]:!py-10px [&_.arco-collapse-item-header]:!pr-0 [&_.arco-collapse-item-header]:hover:!bg-fill-1 [&_.arco-collapse-item-header-title]:!min-w-0 [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content]:!border-0 [&_.arco-collapse-item-content]:!bg-transparent [&_.arco-collapse-item-content-box]:!px-0 [&_.arco-collapse-item-content-box]:!py-0'
    >
      <Collapse.Item
        header={<McpServerHeader server={server} isTestingConnection={isTestingConnection} oauthStatus={oauthStatus} />}
        extra={
          isReadOnly && server.last_test_status !== 'error' ? undefined : (
            <McpServerActions
              server={server}
              isTestingConnection={isTestingConnection}
              oauthStatus={oauthStatus}
              isLoggingIn={isLoggingIn}
              isReadOnly={isReadOnly}
              onTestConnection={onTestConnection}
              onEditServer={onEditServer}
              onDeleteServer={onDeleteServer}
              onOAuthLogin={onOAuthLogin}
            />
          )
        }
        name='1'
      >
        <McpServerToolsList server={server} />
      </Collapse.Item>
    </Collapse>
  );
};

export default McpServerItem;
