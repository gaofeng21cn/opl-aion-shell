import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type { ProjectContextRef } from '@/common/config/configKeys';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import {
  appendProjectContextRefs,
  createProjectContextRef,
  getProjectContextRefs,
  updateProjectContextInputs,
} from '@/renderer/utils/workspace/projectContext';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { CloseSmall, FileText, FolderClose, Plus } from '@icon-park/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type ProjectContextSectionProps = {
  workspace: string;
};

const ProjectContextSection: React.FC<ProjectContextSectionProps> = ({ workspace }) => {
  const { t } = useTranslation();
  const [inputs] = useConfig('workspace.projectContextInputs');
  const refs = useMemo(() => getProjectContextRefs(inputs, workspace), [inputs, workspace]);

  const persist = useCallback(
    async (nextRefs: ProjectContextRef[]) => {
      const previous = inputs ?? {};
      const next = updateProjectContextInputs(previous, workspace, nextRefs);
      try {
        await configService.set('workspace.projectContextInputs', next);
      } catch (error) {
        configService.setLocal('workspace.projectContextInputs', previous);
        console.error('[ProjectContextSection] Failed to persist project context:', error);
        Message.error(t('conversation.history.projectContext.saveFailed'));
      }
    },
    [inputs, t, workspace]
  );

  const addRefs = useCallback(
    async (isFile: boolean) => {
      let paths: string[] | undefined;
      try {
        paths = await ipcBridge.dialog.showOpen.invoke({
          defaultPath: workspace,
          properties: [isFile ? 'openFile' : 'openDirectory', 'multiSelections'],
        });
      } catch (error) {
        console.error('[ProjectContextSection] Failed to select project context:', error);
        Message.error(t('conversation.history.projectContext.selectFailed'));
        return;
      }
      if (!paths?.length) return;

      const additions = paths
        .map((path) => createProjectContextRef(workspace, path, isFile))
        .filter((ref): ref is ProjectContextRef => Boolean(ref));
      if (additions.length !== paths.length) {
        Message.error(t('conversation.history.projectContext.outsideWorkspace'));
      }

      const next = appendProjectContextRefs(workspace, refs, additions);
      if (next.length !== refs.length) await persist(next);
    },
    [persist, refs, t, workspace]
  );

  const addMenu = (
    <Menu
      onClickMenuItem={(key) => {
        void addRefs(key === 'file');
      }}
    >
      <Menu.Item key='file'>
        <span className='flex items-center gap-6px'>
          <FileText size={14} />
          {t('conversation.history.projectContext.addFile')}
        </span>
      </Menu.Item>
      <Menu.Item key='directory'>
        <span className='flex items-center gap-6px'>
          <FolderClose size={14} />
          {t('conversation.history.projectContext.addDirectory')}
        </span>
      </Menu.Item>
    </Menu>
  );

  return (
    <div className='px-14px pb-4px min-w-0' data-testid='project-context-section' data-workspace={workspace}>
      <div className='h-26px flex items-center gap-6px min-w-0'>
        <span className='text-11px font-[500] text-t-tertiary uppercase'>
          {t('conversation.history.projectContext.label')}
        </span>
        <Dropdown droplist={addMenu} trigger='click' position='bl'>
          <Button
            type='text'
            size='mini'
            className='!px-4px !h-22px text-t-secondary'
            icon={<Plus size={12} />}
            aria-label={t('conversation.history.projectContext.add')}
          >
            {t('conversation.history.projectContext.add')}
          </Button>
        </Dropdown>
      </div>
      {refs.map((ref) => (
        <div key={ref.path} className='h-26px flex items-center gap-6px pl-4px min-w-0 group/context-ref'>
          <span className='shrink-0 text-t-tertiary'>
            {ref.isFile ? <FileText size={13} /> : <FolderClose size={13} />}
          </span>
          <Tooltip content={ref.path} position='top'>
            <span className='text-12px text-t-secondary truncate flex-1 min-w-0'>{ref.relativePath || ref.name}</span>
          </Tooltip>
          <Button
            type='text'
            size='mini'
            className='!px-2px !h-20px opacity-70 hover:opacity-100'
            icon={<CloseSmall size={12} />}
            aria-label={t('conversation.history.projectContext.remove', { name: ref.name })}
            onClick={() => void persist(refs.filter((item) => item.path !== ref.path))}
          />
        </div>
      ))}
    </div>
  );
};

export default ProjectContextSection;
