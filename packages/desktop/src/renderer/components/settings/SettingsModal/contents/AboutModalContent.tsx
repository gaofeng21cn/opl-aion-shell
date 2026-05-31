/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Divider, Typography, Button, Switch } from '@arco-design/web-react';
import { Github, Right } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
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
const UPDATE_INCLUDE_NIGHTLY_KEY = 'update.includeNightly';
const UPDATE_LEGACY_INCLUDE_PRERELEASE_KEY = 'update.includePrerelease';

type AppVersions = {
  appVersion: string;
  guiVersion: string;
  frameworkRevision: string;
  releaseRepo: string;
  releaseChannel: string;
  latestStableVersion: string;
};

function formatReleaseChannel(
  channel: string | undefined,
  t: (key: string, options?: Record<string, string>) => string
) {
  const normalized = channel?.trim() || 'stable';
  return t(`settings.runtimePage.releaseChannels.${normalized}`, { channel: normalized });
}

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();

  const [includeNightly, setIncludeNightly] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const appStateQuery = useOplAppState('fast');

  useEffect(() => {
    const saved = localStorage.getItem(UPDATE_INCLUDE_NIGHTLY_KEY);
    const legacySaved = localStorage.getItem(UPDATE_LEGACY_INCLUDE_PRERELEASE_KEY);
    setIncludeNightly((saved ?? legacySaved) === 'true');
  }, []);

  const release = oplRecord(appStateQuery.appState.release);
  const appVersions: AppVersions | null = appStateQuery.payload
    ? {
        appVersion: __OPL_RELEASE_VERSION__ || __APP_VERSION__,
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
        latestStableVersion: oplString(release.app_version) ?? oplString(release.version) ?? '',
      }
    : null;

  const handleNightlyChange = (val: boolean) => {
    setIncludeNightly(val);
    localStorage.setItem(UPDATE_INCLUDE_NIGHTLY_KEY, String(val));
    localStorage.setItem(UPDATE_LEGACY_INCLUDE_PRERELEASE_KEY, String(val));
  };

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const checkUpdate = () => {
    // 使用 window 自定义事件在渲染进程内部通信（buildEmitter 只支持主进程->渲染进程）
    // Use window custom event for renderer-side communication (buildEmitter only works main->renderer)
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));
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
                {appVersions
                  ? t('settings.aboutVersionBadge', {
                      version: appVersions.appVersion,
                      channel: formatReleaseChannel(appVersions.releaseChannel, t),
                    })
                  : t('common.loading')}
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
            {appVersions && (
              <div className='flex flex-col items-center gap-4px mb-16px text-12px text-t-secondary'>
                <Typography.Text>
                  {t('settings.aboutShellVersion', { version: appVersions.guiVersion })}
                </Typography.Text>
                <Typography.Text>
                  {t('settings.aboutFrameworkRevision', { revision: appVersions.frameworkRevision })}
                </Typography.Text>
                {appVersions.latestStableVersion && appVersions.latestStableVersion !== appVersions.appVersion && (
                  <Typography.Text>
                    {t('settings.aboutLatestStableVersion', { version: appVersions.latestStableVersion })}
                  </Typography.Text>
                )}
              </div>
            )}

            {/* Check Update Section */}
            {isElectron && (
              <div className='flex flex-col items-center gap-12px w-full max-w-300px bg-fill-2 p-16px rounded-lg'>
                <Button type='primary' long onClick={checkUpdate}>
                  {t('settings.checkForUpdates')}
                </Button>
                <div className='flex items-center justify-between w-full'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.includeNightlyUpdates')}
                  </Typography.Text>
                  <Switch size='small' checked={includeNightly} onChange={handleNightlyChange} />
                </div>
              </div>
            )}
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
