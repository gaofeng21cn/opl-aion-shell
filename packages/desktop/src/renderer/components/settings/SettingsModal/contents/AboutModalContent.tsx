/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { resolveUpdaterReleaseChannel } from '@/common/update/updateChannel';
import { useDesktopAutoUpdateStatus } from '@/renderer/hooks/ui/useDesktopAutoUpdateStatus';
import { getAppState, oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { projectDesktopAutoUpdateStatus } from '@/renderer/services/desktopAutoUpdateProjection';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { Button, Modal, Typography } from '@arco-design/web-react';
import { Help, Info, Refresh, Right } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FeedbackReportModal from './FeedbackReportModal';

type LinkItem =
  | { id: string; title: string; url: string; onClick?: never }
  | { id: string; title: string; onClick: () => void; url?: never };

const OPL_APP_REPO_URL = 'https://github.com/gaofeng21cn/one-person-lab-app';
const OPL_APP_RELEASES_URL = `${OPL_APP_REPO_URL}/releases`;
const OPL_FRAMEWORK_URL = 'https://github.com/gaofeng21cn/one-person-lab';

type AppVersions = {
  appVersion: string;
  guiVersion: string;
  frameworkRevision: string;
  releaseRepo: string;
  releaseChannel: string;
};

function localAppVersion(): string {
  return __OPL_RELEASE_VERSION__ || __APP_VERSION__;
}

function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const isElectron = isElectronDesktop();
  const currentAppVersion = localAppVersion();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const {
    supported: updaterSupported,
    status: updaterStatus,
    setStatus: setUpdaterStatus,
  } = useDesktopAutoUpdateStatus();
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const appStateQuery = useOplAppState('fast', { autoLoad: false });
  const release = oplRecord(appStateQuery.appState.release);
  const appVersions: AppVersions = {
    appVersion: currentAppVersion,
    guiVersion: __SHELL_VERSION__,
    frameworkRevision:
      oplString(release.opl_framework_revision) ??
      oplString(release.framework_revision) ??
      oplString(release.opl_framework_commit) ??
      oplString(release.framework_commit) ??
      oplString(release.opl_framework_date) ??
      oplString(release.framework_date) ??
      '-',
    releaseRepo: oplString(release.repo) ?? oplString(release.release_repo) ?? OPL_APP_REPO_URL,
    releaseChannel: oplString(release.channel) ?? oplString(release.release_channel) ?? 'stable',
  };

  const updaterProjection = projectDesktopAutoUpdateStatus(updaterSupported, updaterStatus, t);

  const checkForUpdates = useCallback(async () => {
    if (!isElectron) {
      return;
    }
    setUpdaterStatus({ status: 'checking' });
    try {
      const channel = resolveUpdaterReleaseChannel(getAppState(await appStateQuery.load('fast', { background: true })));
      const result = await ipcBridge.autoUpdate.check.invoke({ channel });
      const decision = result?.data?.decision;
      if (!decision) {
        setUpdaterStatus({ status: 'error' });
        return;
      }
      const candidate = decision.latest?.updaterVersion || '';
      setUpdaterStatus(
        decision.updateAvailable && candidate
          ? { status: 'available', version: decision.latest?.version || candidate }
          : { status: 'not-available' }
      );
    } catch {
      setUpdaterStatus({ status: 'error' });
    }
  }, [appStateQuery, isElectron, setUpdaterStatus]);

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const linkItems: LinkItem[] = [
    {
      id: 'help',
      title: t('settings.helpDocumentation'),
      url: OPL_FRAMEWORK_URL,
    },
    {
      id: 'releases',
      title: t('settings.releasePage'),
      url: OPL_APP_RELEASES_URL,
    },
    {
      id: 'feedback',
      title: t('settings.feedback'),
      onClick: () => setShowFeedbackModal(true),
    },
  ];

  return (
    <div className='opl-settings-page flex h-full w-full flex-col' data-testid='settings-page-about'>
      <div className='min-w-0 overflow-visible'>
        <div className='space-y-14px'>
          <div className='opl-settings-page-header'>
            <div className='opl-settings-page-header__copy'>
              <Typography.Title heading={4} className='mb-4px'>
                {t('settings.appName')}
              </Typography.Title>
              <Typography.Text className='text-13px text-t-secondary'>{t('settings.appDescription')}</Typography.Text>
            </div>
          </div>

          <div className='flex min-w-0 flex-col gap-12px' data-testid='settings-about-primary'>
            <section className='opl-settings-section' id='version' data-testid='about-version-section'>
              {updaterProjection.needsAttention && <span data-testid='settings-about-exception' aria-hidden='true' />}
              <div className='opl-settings-section__header'>
                <div className='flex min-w-0 items-start gap-12px'>
                  <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                    <Info theme='outline' size='16' />
                  </span>
                  <div className='min-w-0'>
                    <div className='text-14px font-medium text-t-primary leading-22px'>
                      {t('settings.aboutVersionTitle')}
                    </div>
                    <div className='mt-2px text-12px text-t-tertiary leading-18px'>
                      {t('settings.aboutVersionDesc')}
                    </div>
                  </div>
                </div>
              </div>
              <div className='min-w-0 border-0 border-t border-solid border-[var(--border-base)]'>
                <div className='grid min-w-0 sm:grid-cols-2'>
                  <div className='min-w-0 p-16px'>
                    <div className='text-12px text-t-tertiary'>{t('settings.aboutAppVersion')}</div>
                    <div className='mt-6px break-words text-16px font-medium text-t-primary'>
                      {appVersions.appVersion}
                    </div>
                  </div>
                  <div
                    className='min-w-0 border-0 border-t border-solid border-[var(--border-base)] p-16px sm:border-l sm:border-t-0'
                    id='channel'
                  >
                    <div className='text-12px text-t-tertiary'>{t('settings.aboutReleaseChannel')}</div>
                    <div className='mt-6px break-words text-16px font-medium text-t-primary'>
                      {formatReleaseChannel(appVersions.releaseChannel, t)}
                    </div>
                  </div>
                </div>
                <div
                  className='flex min-w-0 flex-col gap-12px border-0 border-t border-solid border-[var(--border-base)] p-16px sm:flex-row sm:items-center sm:justify-between'
                  id='updates'
                  data-testid='about-update-section'
                >
                  <div className='min-w-0' id='update-status' data-testid='about-update-copy'>
                    <div className='text-12px text-t-tertiary'>{t('settings.checkForUpdates')}</div>
                    <div className='mt-4px text-13px text-t-primary' data-testid='about-update-status'>
                      {updaterProjection.label}
                    </div>
                  </div>
                  <span data-testid='settings-about-primary-action'>
                    {isElectron && (
                      <Button
                        type='primary'
                        icon={<Refresh />}
                        loading={updaterStatus?.status === 'checking'}
                        onClick={() => void checkForUpdates()}
                        data-testid='about-check-updates'
                      >
                        {t('settings.checkForUpdates')}
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            </section>

            <section className='opl-settings-section' id='feedback'>
              <span id='help-feedback' aria-hidden='true' />
              <div className='opl-settings-section__header'>
                <div className='flex min-w-0 items-start gap-12px'>
                  <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
                    <Help theme='outline' size='16' />
                  </span>
                  <div className='min-w-0'>
                    <div className='text-14px font-medium text-t-primary leading-22px'>
                      {t('settings.aboutSupportTitle')}
                    </div>
                    <div className='mt-2px text-12px text-t-tertiary leading-18px'>
                      {t('settings.aboutSupportDesc')}
                    </div>
                  </div>
                </div>
              </div>
              <div className='opl-settings-list'>
                {linkItems.map((item) => (
                  <button
                    key={item.id}
                    type='button'
                    className='opl-settings-row w-full cursor-pointer border-0 bg-transparent px-16px text-left hover:bg-fill-1'
                    onClick={() => {
                      if ('url' in item) {
                        void openLink(item.url);
                      } else {
                        item.onClick();
                      }
                    }}
                    data-testid={`about-link-${item.id}`}
                  >
                    <span
                      className='flex w-full min-w-0 flex-1 items-center justify-between gap-16px text-left'
                      data-testid={`about-link-${item.id}-content`}
                    >
                      <span className='opl-settings-row__main min-w-0 flex-1 text-14px text-t-primary'>
                        {item.title}
                      </span>
                      <span className='opl-settings-row__meta shrink-0'>
                        <Right theme='outline' size='16' />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className='flex justify-end'>
            <Button data-testid='settings-about-diagnostics-action' onClick={() => setTechnicalDetailsOpen(true)}>
              {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
            </Button>
          </div>
          <Modal
            visible={technicalDetailsOpen}
            title={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
            footer={null}
            onCancel={() => setTechnicalDetailsOpen(false)}
            unmountOnExit
          >
            <div id='technical-details' data-testid='settings-about-technical-details'>
              <div className='space-y-6px text-12px text-t-secondary' data-testid='about-technical-details'>
                <Typography.Text className='block'>
                  {t('settings.aboutShellVersion', { version: appVersions.guiVersion })}
                </Typography.Text>
                <Typography.Text className='block'>
                  {t('settings.aboutFrameworkRevision', { revision: appVersions.frameworkRevision })}
                </Typography.Text>
                <Typography.Text className='block break-words'>
                  {t('settings.releasePage')}: {appVersions.releaseRepo}
                </Typography.Text>
              </div>
            </div>
          </Modal>
        </div>
      </div>
      <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
    </div>
  );
};

export default AboutModalContent;
