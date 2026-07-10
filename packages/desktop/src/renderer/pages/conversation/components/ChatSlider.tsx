import type { TChatConversation, TConversationRuntimeSummary } from '@/common/config/storage';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Empty, Input, Tabs } from '@arco-design/web-react';
import {
  Checklist,
  Down,
  FolderOpen,
  Lightning,
  Link,
  MemoryCard,
  PreviewOpen,
  Terminal,
  Timer,
  Up,
} from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PreviewPanel, usePreviewContext } from '../Preview';
import ChatWorkspace from '../Workspace';
import CurrentTaskAwareness from '../runtime/CurrentTaskAwareness';
import WorkspaceOpenButton from './ChatLayout/WorkspaceOpenButton';

type PrimaryTool = 'review' | 'terminal' | 'browser' | 'files';
type SecondaryTool = 'artifacts' | 'runtime' | 'actions' | 'memory';

const normalizeBrowserUrl = (value: string): string | null => {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const ChatSlider: React.FC<{
  conversation?: TChatConversation;
  currentTask?: TConversationRuntimeSummary['current_task'] | null;
  actionsSlot?: React.ReactNode;
}> = ({ conversation, currentTask, actionsSlot }) => {
  const { t } = useTranslation();
  const workspace = conversation?.extra?.workspace;
  const supportsWorkspace =
    conversation?.type === 'acp' || conversation?.type === 'codex' || conversation?.type === 'aionrs';
  const isTemporaryWorkspace = Boolean(
    (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)?.is_temporary_workspace
  );
  const hasWorkspace = Boolean(conversation?.id && workspace && supportsWorkspace);
  const hasTerminal = hasWorkspace && !isTemporaryWorkspace;
  const [activeTool, setActiveTool] = useState<PrimaryTool>(hasWorkspace ? 'review' : 'browser');
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [secondaryTool, setSecondaryTool] = useState<SecondaryTool>('artifacts');
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserUrlInvalid, setBrowserUrlInvalid] = useState(false);
  const { activeTab, isOpen: isPreviewOpen, openPreview } = usePreviewContext();

  useEffect(() => {
    if (!hasWorkspace && activeTool !== 'browser') setActiveTool('browser');
  }, [activeTool, hasWorkspace]);

  useEffect(() => {
    if (!isPreviewOpen || !activeTab) return;
    if (activeTab.content_type === 'url') {
      setActiveTool('browser');
      setSecondaryOpen(false);
      return;
    }
    setSecondaryTool('artifacts');
    setSecondaryOpen(true);
  }, [activeTab, isPreviewOpen]);

  const memoryRefs = useMemo(() => {
    const task = currentTask as unknown as Record<string, unknown> | null | undefined;
    if (!task) return [];
    const values = [task.memory_ref, ...(Array.isArray(task.memory_refs) ? task.memory_refs : [])];
    return values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  }, [currentTask]);

  const selectPrimaryTool = (key: string) => {
    setActiveTool(key as PrimaryTool);
    setSecondaryOpen(false);
  };

  const selectSecondaryTool = (tool: SecondaryTool) => {
    setSecondaryTool(tool);
    setSecondaryOpen(true);
  };

  const openBrowser = () => {
    const url = normalizeBrowserUrl(browserUrl);
    setBrowserUrlInvalid(!url);
    if (!url) return;
    openPreview(url, 'url', { title: url }, { replace: true });
  };

  const workspaceNode =
    hasWorkspace && workspace && conversation ? (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={workspace}
        isTemporaryWorkspace={isTemporaryWorkspace}
        eventPrefix={conversation.type === 'codex' ? 'codex' : conversation.type === 'aionrs' ? 'aionrs' : 'acp'}
        currentTask={currentTask}
        activeTab={activeTool === 'files' ? 'files' : 'changes'}
        showCurrentTask={false}
        showTabBar={false}
      />
    ) : null;

  const primaryContent = (() => {
    if (activeTool === 'review' || activeTool === 'files') return workspaceNode;
    if (activeTool === 'terminal') {
      return workspace && hasTerminal && isElectronDesktop() ? (
        <div className='conversation-side-panel__centered-action'>
          <WorkspaceOpenButton workspacePath={workspace} isTemporary={isTemporaryWorkspace} tool='terminal' showLabel />
        </div>
      ) : (
        <Empty description={t('conversation.sidePanel.unavailable')} />
      );
    }
    return (
      <div className='conversation-side-panel__browser'>
        <div className='conversation-side-panel__browser-bar'>
          <Input
            value={browserUrl}
            status={browserUrlInvalid ? 'error' : undefined}
            aria-label={t('conversation.sidePanel.browserAddress')}
            placeholder={t('conversation.sidePanel.browserAddress')}
            onChange={(value) => {
              setBrowserUrl(value);
              setBrowserUrlInvalid(false);
            }}
            onPressEnter={openBrowser}
          />
          <Button
            type='primary'
            icon={<Link size={14} />}
            aria-label={t('conversation.sidePanel.openBrowser')}
            onClick={openBrowser}
          />
        </div>
        <div className='conversation-side-panel__content'>
          {isPreviewOpen && activeTab?.content_type === 'url' ? (
            <PreviewPanel />
          ) : (
            <Empty description={t('conversation.sidePanel.browserEmpty')} />
          )}
        </div>
      </div>
    );
  })();

  const secondaryContent = (() => {
    if (secondaryTool === 'artifacts') {
      return isPreviewOpen ? <PreviewPanel /> : <Empty description={t('conversation.sidePanel.artifactsEmpty')} />;
    }
    if (secondaryTool === 'runtime') {
      return <CurrentTaskAwareness task={currentTask} />;
    }
    if (secondaryTool === 'actions') {
      return actionsSlot ? (
        <div className='conversation-side-panel__actions'>{actionsSlot}</div>
      ) : (
        <Empty description={t('conversation.sidePanel.actionsEmpty')} />
      );
    }
    return memoryRefs.length ? (
      <ul className='conversation-side-panel__refs'>
        {memoryRefs.map((ref) => (
          <li key={ref}>{ref}</li>
        ))}
      </ul>
    ) : (
      <Empty description={t('conversation.sidePanel.memoryEmpty')} />
    );
  })();

  return (
    <div className='conversation-side-panel' data-testid='conversation-side-panel'>
      <Tabs activeTab={activeTool} type='line' size='small' onChange={selectPrimaryTool}>
        <Tabs.TabPane
          key='review'
          disabled={!hasWorkspace}
          title={
            <span className='conversation-side-panel__tab'>
              <Checklist size={14} />
              {t('conversation.sidePanel.review')}
            </span>
          }
        />
        <Tabs.TabPane
          key='terminal'
          disabled={!hasTerminal}
          title={
            <span className='conversation-side-panel__tab'>
              <Terminal size={14} />
              {t('conversation.sidePanel.terminal')}
            </span>
          }
        />
        <Tabs.TabPane
          key='browser'
          title={
            <span className='conversation-side-panel__tab'>
              <PreviewOpen size={14} />
              {t('conversation.sidePanel.browser')}
            </span>
          }
        />
        <Tabs.TabPane
          key='files'
          disabled={!hasWorkspace}
          title={
            <span className='conversation-side-panel__tab'>
              <FolderOpen size={14} />
              {t('conversation.sidePanel.files')}
            </span>
          }
        />
      </Tabs>

      <div className='conversation-side-panel__primary'>{primaryContent}</div>

      <div className='conversation-side-panel__secondary'>
        <Button
          type='text'
          long
          className='conversation-side-panel__secondary-toggle'
          aria-expanded={secondaryOpen}
          onClick={() => setSecondaryOpen((value) => !value)}
        >
          <span>{t('conversation.sidePanel.moreContext')}</span>
          {secondaryOpen ? <Up size={14} /> : <Down size={14} />}
        </Button>
        {secondaryOpen && (
          <>
            <div
              className='conversation-side-panel__secondary-nav'
              aria-label={t('conversation.sidePanel.moreContext')}
            >
              <Button
                type={secondaryTool === 'artifacts' ? 'secondary' : 'text'}
                size='mini'
                icon={<PreviewOpen size={13} />}
                onClick={() => selectSecondaryTool('artifacts')}
              >
                {t('conversation.sidePanel.artifacts')}
              </Button>
              <Button
                type={secondaryTool === 'runtime' ? 'secondary' : 'text'}
                size='mini'
                icon={<Timer size={13} />}
                onClick={() => selectSecondaryTool('runtime')}
              >
                {t('conversation.sidePanel.runtime')}
              </Button>
              <Button
                type={secondaryTool === 'actions' ? 'secondary' : 'text'}
                size='mini'
                icon={<Lightning size={13} />}
                onClick={() => selectSecondaryTool('actions')}
              >
                {t('conversation.sidePanel.actions')}
              </Button>
              <Button
                type={secondaryTool === 'memory' ? 'secondary' : 'text'}
                size='mini'
                icon={<MemoryCard size={13} />}
                onClick={() => selectSecondaryTool('memory')}
              >
                {t('conversation.sidePanel.memory')}
              </Button>
            </div>
            <div className='conversation-side-panel__secondary-content'>{secondaryContent}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatSlider;
