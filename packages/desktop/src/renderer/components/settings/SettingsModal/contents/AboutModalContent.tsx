/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getAppState, oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { Button, Modal, Typography } from '@arco-design/web-react';
import { Help, Info, Refresh, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FeedbackReportModal from './FeedbackReportModal';

type LinkItem =
  | { id: string; title: string; url: string; onClick?: never }
  | { id: string; title: string; onClick: () => void; url?: never };

type UpdateStatus = 'checking' | 'current' | 'available' | 'unknown';

const OPL_APP_REPO_URL = 'https://github.com/gaofeng21cn/one-person-lab-app';
const OPL_APP_RELEASES_URL = `${OPL_APP_REPO_URL}/releases`;
const OPL_FRAMEWORK_URL = 'https://github.com/gaofeng21cn/one-person-lab';

function resolveUpdaterChannel(appState: Record<string, unknown>): 'stable' | 'nightly' {
  const release = oplRecord(appState.release);
  const managedUpdate = oplRecord(appState.managed_update_plane);
  const frameworkChannel =
    oplString(release.channel) ?? oplString(appState.update_channel) ?? oplString(managedUpdate.update_channel);
  return frameworkChannel === 'preview' ? 'nightly' : 'stable';
}

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

function parseVersionParts(version: string | undefined): number[] | null {
  const normalized = version?.trim().replace(/^v/i, '');
  if (!normalized) return null;
  const parts = normalized.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const numbers = parts.map((part) => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (numbers.some((part) => !Number.isSafeInteger(part))) return null;
  return numbers;
}

function isNewerVersion(candidate: string | undefined, current: string): boolean {
  const candidateParts = parseVersionParts(candidate);
  const currentParts = parseVersionParts(current);
  if (!candidateParts || !currentParts) return false;
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }
  return false;
}

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const isElectron = isElectronDesktop();
  const currentAppVersion = localAppVersion();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [latestStableVersion, setLatestStableVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(isElectron ? 'checking' : 'unknown');
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const appStateQuery = useOplAppState('fast', { autoLoad: false });
  const loadAppState = appStateQuery.load;
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

  const checkForUpdates = useCallback(async () => {
    if (!isElectron) {
      setUpdateStatus('unknown');
      return;
    }
    setUpdateStatus('checking');
    try {
      const channel = resolveUpdaterChannel(getAppState(await loadAppState('fast', { background: true })));
      const result = await ipcBridge.update.check.invoke({ channel });
      if (!result?.success) {
        setLatestStableVersion('');
        setUpdateStatus('unknown');
        return;
      }
      const candidate = result.data?.latest?.version || '';
      const updateAvailable =
        Boolean(candidate) && (result.data?.updateAvailable === true || isNewerVersion(candidate, currentAppVersion));
      setLatestStableVersion(updateAvailable ? candidate : '');
      setUpdateStatus(updateAvailable ? 'available' : 'current');
    } catch {
      setLatestStableVersion('');
      setUpdateStatus('unknown');
    }
  }, [currentAppVersion, isElectron, loadAppState]);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const updateStatusLabel =
    updateStatus === 'checking'
      ? t('settings.aboutUpdateChecking')
      : updateStatus === 'available'
        ? t('settings.aboutUpdateAvailable', { version: latestStableVersion })
        : updateStatus === 'current'
          ? t('settings.aboutUpdateCurrent')
          : t('settings.aboutUpdateUnknown');

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
              {updateStatus === 'unknown' && <span data-testid='settings-about-exception' aria-hidden='true' />}
              <div className='opl-settings-section__header'>
                <div className='flex min-w-0 items-start gap-12px'>
                  <span className='flex h-28px w-28px shrink-0 items-center justify-center rounded-6px bg-fill-2 text-t-secondary'>
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
              <div className='grid min-w-0 border-t border-solid border-[var(--border-base)] sm:grid-cols-3'>
                <div className='min-w-0 p-16px'>
                  <div className='text-12px text-t-tertiary'>{t('settings.aboutAppVersion')}</div>
                  <div className='mt-6px break-words text-16px font-medium text-t-primary'>
                    {appVersions.appVersion}
                  </div>
                </div>
                <div
                  className='min-w-0 border-t border-solid border-[var(--border-base)] p-16px sm:border-l sm:border-t-0'
                  id='channel'
                >
                  <div className='text-12px text-t-tertiary'>{t('settings.aboutReleaseChannel')}</div>
                  <div className='mt-6px break-words text-16px font-medium text-t-primary'>
                    {formatReleaseChannel(appVersions.releaseChannel, t)}
                  </div>
                </div>
                <div
                  className='flex min-w-0 flex-col justify-center gap-10px border-t border-solid border-[var(--border-base)] p-16px sm:border-l sm:border-t-0'
                  id='updates'
                  data-testid='about-update-section'
                >
                  <div className='min-w-0' id='update-status' data-testid='about-update-copy'>
                    <div className='text-12px text-t-tertiary'>{t('settings.checkForUpdates')}</div>
                    <div className='mt-4px text-13px text-t-primary' data-testid='about-update-status'>
                      {updateStatusLabel}
                    </div>
                  </div>
                  {isElectron && (
                    <span data-testid='settings-about-primary-action'>
                      <Button
                        type='primary'
                        icon={<Refresh />}
                        loading={updateStatus === 'checking'}
                        onClick={() => void checkForUpdates()}
                        data-testid='about-check-updates'
                      >
                        {t('settings.checkForUpdates')}
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className='opl-settings-section' id='feedback'>
              <span id='help-feedback' aria-hidden='true' />
              <div className='opl-settings-section__header'>
                <div className='flex min-w-0 items-start gap-12px'>
                  <span className='flex h-28px w-28px shrink-0 items-center justify-center rounded-6px bg-fill-2 text-t-secondary'>
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
