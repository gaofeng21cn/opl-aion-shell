import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import type { IMcpServer } from '@/common/config/storage';

interface McpServerToolsListProps {
  server: IMcpServer;
}

const McpServerToolsList: React.FC<McpServerToolsListProps> = ({ server }) => {
  const { t } = useTranslation();

  if (!server.tools || server.tools.length === 0) {
    return null;
  }

  return (
    <div
      className='ml-32px divide-y divide-border-1 border-t border-solid border-border-1'
      data-testid='mcp-server-tools-list'
    >
      {server.tools.map((tool, index) => (
        <div
          key={index}
          className='flex min-w-0 flex-col gap-2px py-9px sm:flex-row sm:items-start sm:gap-16px'
          data-testid='mcp-server-tool-row'
        >
          <div className='min-w-0 break-words text-13px font-500 leading-18px text-t-primary sm:w-1/3'>{tool.name}</div>
          <div className='min-w-0 flex-1'>
            <Tooltip content={tool.description || t('settings.mcpNoDescription')}>
              <div className='line-clamp-2 cursor-help text-12px leading-18px text-t-secondary sm:line-clamp-1'>
                {tool.description || t('settings.mcpNoDescription')}
              </div>
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
};

export default McpServerToolsList;
