import React, { useMemo } from 'react';
import { Button, Empty, Message, Tag } from '@arco-design/web-react';
import { Copy, FolderOpen, Left } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { copyText } from '@renderer/utils/ui/clipboard';
import { RUNTIME_TRAY_ITEM_STORAGE_KEY, type RuntimeTrayOpenPayload } from './types';

const readStoredRuntimeItem = (): RuntimeTrayOpenPayload | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(RUNTIME_TRAY_ITEM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeTrayOpenPayload) : null;
  } catch {
    return null;
  }
};

const getSourceRefLabel = (ref: Record<string, unknown>, fallback: string): string => {
  for (const key of ['label', 'title', 'surface', 'kind', 'type']) {
    const value = ref[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
};

const getSourceRefDetail = (ref: Record<string, unknown>): string => {
  for (const key of ['path', 'file', 'url', 'href', 'id']) {
    const value = ref[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  try {
    return JSON.stringify(ref, null, 2);
  } catch {
    return '';
  }
};

const RuntimeTrayItemPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const runtimeItem = useMemo(() => {
    const state = location.state as { runtimeItem?: RuntimeTrayOpenPayload } | null;
    return state?.runtimeItem ?? readStoredRuntimeItem();
  }, [location.state]);

  const handleOpenWorkspace = () => {
    if (!runtimeItem?.workspacePath) return;
    void ipcBridge.shell.openFile.invoke(runtimeItem.workspacePath).catch((error) => {
      Message.error(error instanceof Error ? error.message : t('common.unknownError'));
    });
  };

  const handleCopyCommand = () => {
    if (!runtimeItem?.command) return;
    void copyText(runtimeItem.command)
      .then(() => Message.success(t('common.copySuccess')))
      .catch(() => Message.error(t('common.copyFailed')));
  };

  if (!runtimeItem) {
    return (
      <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
        <div className='mx-auto flex w-full max-w-800px flex-col gap-28px box-border'>
          <Button
            type='text'
            size='small'
            className='w-fit !px-0 !text-14px md:!text-15px !text-t-secondary hover:!text-t-primary'
            icon={<Left theme='outline' size={16} className='line-height-0 shrink-0' />}
            onClick={() => navigate('/guid')}
          >
            {t('common.historyBack')}
          </Button>
          <div className='flex min-h-320px items-center justify-center'>
            <Empty
              description={
                <div className='flex flex-col gap-6px text-center'>
                  <span className='text-t-primary'>{t('common.runtimeTray.noItem')}</span>
                  <span className='text-t-secondary'>{t('common.runtimeTray.noItemDescription')}</span>
                </div>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const sourceRefs = runtimeItem.sourceRefs || [];

  return (
    <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
      <div className='mx-auto flex w-full max-w-860px flex-col gap-28px box-border'>
        <Button
          type='text'
          size='small'
          className='w-fit !px-0 !text-14px md:!text-15px !text-t-secondary hover:!text-t-primary'
          icon={<Left theme='outline' size={16} className='line-height-0 shrink-0' />}
          onClick={() => navigate('/guid')}
        >
          {t('common.historyBack')}
        </Button>

        <div className='flex flex-col gap-14px pb-8px'>
          <div className='flex flex-wrap items-start justify-between gap-14px'>
            <h1 className='m-0 min-w-0 flex-1 break-words text-30px font-bold leading-38px text-t-primary md:text-34px md:leading-42px'>
              {runtimeItem.title || t('common.tray.untitled')}
            </h1>
            {runtimeItem.statusLabel && (
              <Tag color='blue' className='shrink-0'>
                {runtimeItem.statusLabel}
              </Tag>
            )}
          </div>
          {runtimeItem.summary && <p className='m-0 text-15px leading-24px text-t-secondary'>{runtimeItem.summary}</p>}
        </div>

        <section className='flex flex-col gap-12px'>
          <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.technical_details')}</h2>
          <div className='h-1px w-full bg-[var(--color-border-2)]' />
          <dl className='m-0 grid grid-cols-1 gap-14px md:grid-cols-[160px_minmax(0,1fr)]'>
            <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.project')}</dt>
            <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.projectLabel}</dd>
            <dt className='text-13px text-t-secondary'>{t('common.status')}</dt>
            <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.statusLabel}</dd>
            {runtimeItem.updatedAt && (
              <>
                <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.updatedAt')}</dt>
                <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>
                  {new Date(runtimeItem.updatedAt).toLocaleString()}
                </dd>
              </>
            )}
            {runtimeItem.workspacePath && (
              <>
                <dt className='text-13px text-t-secondary'>{t('common.workspace')}</dt>
                <dd className='m-0 flex min-w-0 flex-wrap items-center gap-8px text-14px text-t-primary'>
                  <code className='min-w-0 break-all rounded bg-fill-2 px-6px py-2px text-12px'>
                    {runtimeItem.workspacePath}
                  </code>
                  <Button
                    size='mini'
                    type='text'
                    icon={<FolderOpen theme='outline' size={14} />}
                    onClick={handleOpenWorkspace}
                  >
                    {t('common.runtimeTray.openWorkspace')}
                  </Button>
                </dd>
              </>
            )}
            {runtimeItem.command && (
              <>
                <dt className='text-13px text-t-secondary'>{t('settings.command')}</dt>
                <dd className='m-0 flex min-w-0 flex-wrap items-center gap-8px text-14px text-t-primary'>
                  <code className='min-w-0 break-all rounded bg-fill-2 px-6px py-2px text-12px'>
                    {runtimeItem.command}
                  </code>
                  <Button size='mini' type='text' icon={<Copy theme='outline' size={14} />} onClick={handleCopyCommand}>
                    {t('common.copy')}
                  </Button>
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className='flex flex-col gap-12px'>
          <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.sourceRefs')}</h2>
          <div className='h-1px w-full bg-[var(--color-border-2)]' />
          {sourceRefs.length > 0 ? (
            <div className='flex flex-col gap-12px'>
              {sourceRefs.map((ref, index) => (
                <div key={`${runtimeItem.itemId}-${index}`} className='flex flex-col gap-5px'>
                  <div className='text-13px font-medium text-t-primary'>
                    {getSourceRefLabel(ref, t('common.runtimeTray.sourceRef', { index: index + 1 }))}
                  </div>
                  <code className='block min-w-0 whitespace-pre-wrap break-all rounded bg-fill-2 px-8px py-6px text-12px text-t-secondary'>
                    {getSourceRefDetail(ref)}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <Empty description={t('common.runtimeTray.noSourceRefs')} />
          )}
        </section>
      </div>
    </div>
  );
};

export default RuntimeTrayItemPage;
