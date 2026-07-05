/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Divider, Typography } from '@arco-design/web-react';
import { Github, Right } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { ipcBridge } from '@/common';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import FeedbackReportModal from './FeedbackReportModal';
import { oplRecord, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';

type LinkItem =
  | { title: string; url: string; icon: React.ReactNode; onClick?: never }
  | { title: string; onClick: () => void; icon: React.ReactNode; url?: never };

const OPL_APP_REPO_URL = 'https://github.com/gaofeng21cn/one-person-lab-app';
const OPL_APP_RELEASES_URL = `${OPL_APP_REPO_URL}/releases`;
const OPL_APP_LATEST_RELEASE_URL = `${OPL_APP_REPO_URL}/releases/latest`;
const OPL_FRAMEWORK_URL = 'https://github.com/gaofeng21cn/one-person-lab';
const includeNightlyUpdates = false;

type AppVersions = {
  appVersion: string;
  guiVersion: string;
  frameworkRevision: string;
  releaseRepo: string;
  releaseChannel: string;
  latestStableVersion: string;
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
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [latestStableVersion, setLatestStableVersion] = useState('');
  const appStateQuery = useOplAppState('fast');

  const release = oplRecord(appStateQuery.appState.release);
  const currentAppVersion = localAppVersion();
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
    releaseRepo: oplString(release.repo) ?? oplString(release.release_repo) ?? '',
    releaseChannel: oplString(release.channel) ?? oplString(release.release_channel) ?? 'stable',
    latestStableVersion,
  };

  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    const channel = includeNightlyUpdates ? 'nightly' : 'stable';
    void ipcBridge.update.check
      .invoke({ channel })
      .then((result) => {
        if (cancelled) return;
        const candidate = result?.success ? result.data?.latest?.version : '';
        setLatestStableVersion(isNewerVersion(candidate, currentAppVersion) ? candidate || '' : '');
      })
      .catch(() => {
        if (!cancelled) setLatestStableVersion('');
      });
    return () => {
      cancelled = true;
    };
  }, [currentAppVersion, isElectron]);

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const openUpdateSettings = () => {
    window.location.hash = '#/settings/update';
  };

  const linkItems: LinkItem[] = [
    {
      title: t('settings.helpDocumentation'),
      url: OPL_FRAMEWORK_URL,
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.updateLog'),
      url: OPL_APP_RELEASES_URL,
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.feedback'),
      url: `${OPL_APP_REPO_URL}/issues`,
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.bugReport'),
      onClick: () => setShowFeedbackModal(true),
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.contactMe'),
      url: `${OPL_APP_REPO_URL}/issues/new`,
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.officialWebsite'),
      url: OPL_APP_LATEST_RELEASE_URL,
      icon: <Right theme='outline' size='16' />,
    },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Content Area */}
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className='flex flex-col max-w-500px mx-auto'>
          {/* App Info Section */}
          <div className='flex flex-col items-center pb-24px'>
            <Typography.Title heading={3} className='text-24px font-bold text-t-primary mb-8px'>
              {t('settings.appName')}
            </Typography.Title>
            <Typography.Text className='text-14px text-t-secondary mb-12px text-center'>
              {t('settings.appDescription')}
            </Typography.Text>
            <div className='flex items-center justify-center gap-8px mb-16px'>
              <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-primary font-500'>
                {t('settings.aboutVersionBadge', {
                  version: appVersions.appVersion,
                  channel: formatReleaseChannel(appVersions.releaseChannel, t),
                })}
              </span>
              <div
                className='text-t-primary cursor-pointer hover:text-t-secondary transition-colors p-4px'
                onClick={() =>
                  openLink(OPL_APP_REPO_URL).catch((error) => console.error('Failed to open link:', error))
                }
              >
                <Github theme='outline' size='20' />
              </div>
            </div>
            <div className='flex flex-col items-center gap-4px mb-16px text-12px text-t-secondary'>
              <Typography.Text>{t('settings.aboutShellVersion', { version: appVersions.guiVersion })}</Typography.Text>
              <Typography.Text>
                {t('settings.aboutFrameworkRevision', { revision: appVersions.frameworkRevision })}
              </Typography.Text>
              {appVersions.latestStableVersion && (
                <Typography.Text>
                  {t('settings.aboutLatestStableVersion', { version: appVersions.latestStableVersion })}
                </Typography.Text>
              )}
            </div>
            <div className='flex flex-wrap items-center justify-center gap-8px'>
              {isElectron && (
                <Button type='primary' size='small' onClick={openUpdateSettings} data-testid='about-open-update-settings'>
                  {t('settings.checkForUpdates')}
                </Button>
              )}
              <Button size='small' onClick={() => void openLink(OPL_APP_RELEASES_URL)} data-testid='about-release-notes'>
                {t('settings.updateLog')}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <Divider className='my-16px' />

          {/* Links Section */}
          <div className='flex flex-col gap-4px pt-8px'>
            {linkItems.map((item, index) => (
              <div
                key={index}
                className='flex items-center justify-between px-16px py-12px rd-8px hover:bg-fill-2 transition-all cursor-pointer group'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ('url' in item) {
                    openLink(item.url).catch((error) => console.error('Failed to open link:', error));
                  } else {
                    item.onClick();
                  }
                }}
              >
                <Typography.Text className='text-14px text-t-primary'>{item.title}</Typography.Text>
                <div className='text-t-secondary group-hover:text-t-primary transition-colors'>{item.icon}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
    </div>
  );
};

export default AboutModalContent;
