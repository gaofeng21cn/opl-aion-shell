import { Alert, Button, Spin, Tooltip, Typography } from '@arco-design/web-react';
import { Back, Refresh } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { resolveDomainDetailViewRenderer, resolveDomainDetailViewRendererByViewId } from './domainDetailViewRegistry';
import type { RuntimeTranslate } from './formatters';
import { readRuntimeWorkItemProjectionV2 } from './projection';
import styles from './RuntimePage.module.css';

const DomainDetailViewPage: React.FC = () => {
  const { t } = useTranslation();
  const translate = t as RuntimeTranslate;
  const navigate = useNavigate();
  const { itemId = '', viewId = '' } = useParams();
  const appStateQuery = useOplAppState('fast');
  const projectionRead = useMemo(
    () => readRuntimeWorkItemProjectionV2(appStateQuery.appState),
    [appStateQuery.appState]
  );
  const item = useMemo(
    () => projectionRead.projection?.items.find((candidate) => candidate.id === itemId) ?? null,
    [itemId, projectionRead.projection]
  );
  const descriptor = useMemo(
    () => item?.domainDetailViews.find((candidate) => candidate.viewId === viewId) ?? null,
    [item, viewId]
  );
  const Renderer = descriptor
    ? resolveDomainDetailViewRenderer(descriptor)
    : resolveDomainDetailViewRendererByViewId(viewId);

  if (!appStateQuery.error && Renderer) return <Renderer />;

  const loading = appStateQuery.loading;
  const loadFailed = Boolean(appStateQuery.error);
  const unsupported = Boolean(descriptor);
  return (
    <main className={styles.reasoningPage} data-testid='runtime-domain-detail-view-page'>
      <header className={styles.reasoningHeader}>
        <div className={styles.reasoningHeaderTitle}>
          <Tooltip content={t('common.runtime.researchTrajectory.back')}>
            <Button
              type='text'
              icon={<Back theme='outline' />}
              aria-label={t('common.runtime.researchTrajectory.back')}
              onClick={() => void navigate('/runtime')}
            />
          </Tooltip>
          <Typography.Title heading={4}>{t('common.runtime.researchTrajectory.title')}</Typography.Title>
        </div>
      </header>
      <div className={styles.reasoningContent}>
        <div className={styles.reasoningState} data-testid='runtime-domain-detail-view-state'>
          {loading ? (
            <Spin tip={t('common.runtime.researchTrajectory.loading')} />
          ) : (
            <>
              <Alert
                type={loadFailed ? 'error' : 'info'}
                showIcon
                title={t(
                  loadFailed
                    ? 'common.runtime.researchTrajectory.loadFailedTitle'
                    : unsupported
                      ? 'common.runtime.researchTrajectory.unsupportedTitle'
                      : 'common.runtime.researchTrajectory.missingTitle'
                )}
                content={t(
                  loadFailed
                    ? 'common.runtime.researchTrajectory.loadFailedDescription'
                    : unsupported
                      ? 'common.runtime.researchTrajectory.unsupportedDescription'
                      : 'common.runtime.researchTrajectory.missingDescription'
                )}
              />
              <Button
                type='primary'
                icon={<Refresh theme='outline' />}
                loading={appStateQuery.refreshing}
                onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
              >
                {translate('common.runtime.researchTrajectory.refresh')}
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default DomainDetailViewPage;
