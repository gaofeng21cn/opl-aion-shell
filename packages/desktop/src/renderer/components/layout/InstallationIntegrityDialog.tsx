import { Button, Message, Modal, Space, Typography } from '@arco-design/web-react';
import { Copy, Download, FolderOpen, Help, Refresh } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { buildOplAppIssueUrl, getOplGlobalFeedbackIssueUrl } from '@/common/config/oplProductProfile';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import { openExternalUrl } from '@/renderer/utils/platform';
import { copyText } from '@/renderer/utils/ui/clipboard';

const OPL_DOWNLOAD_URL = 'https://github.com/gaofeng21cn/one-person-lab-app/releases';

export function openDownloadLatest(): void {
  void openExternalUrl(OPL_DOWNLOAD_URL).catch((error) => {
    console.error('[InstallationIntegrityDialog] Failed to open OPL releases:', error);
  });
}

export type InstallationIntegrityDialogKind =
  | 'incomplete_installation'
  | 'recoverable_database_corruption'
  | 'transient_concurrent_startup'
  | 'startup_directory_permission_denied'
  | 'startup_directory_unavailable'
  | 'backend_exited'
  | 'generic_startup_failure';

export type StartupSupportEnvironment = {
  appVersion: string;
  platform: string;
  architecture: string;
};

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint < 32 || codePoint === 127;
}

function sanitizeDiagnosticValue(value: string | undefined): string {
  const sanitized = [...(value ?? '')].map((character) => (isControlCharacter(character) ? ' ' : character)).join('');
  return sanitized.trim() || 'not_reported';
}

export function getSafeMissingResources(missingResources: string[] | undefined): string[] {
  const safeResources = (missingResources ?? []).flatMap((resource) => {
    const normalized = resource.trim().replace(/\\/g, '/');
    if (
      !normalized ||
      [...normalized].some(isControlCharacter) ||
      normalized.startsWith('/') ||
      /^[a-z]:\//i.test(normalized) ||
      /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
      normalized.split('/').includes('..')
    ) {
      return [];
    }
    return [normalized];
  });

  return [...new Set(safeResources)];
}

export function buildStartupDiagnosticSummary(
  diagnosticsKind: InstallationIntegrityDialogKind,
  failure: BackendStartupFailureInfo | undefined,
  environment: StartupSupportEnvironment
): string {
  const missingResources = getSafeMissingResources(failure?.missingResources);
  return [
    'One Person Lab startup diagnostic',
    `App version: ${sanitizeDiagnosticValue(environment.appVersion)}`,
    `Platform: ${sanitizeDiagnosticValue(environment.platform)}`,
    `Architecture: ${sanitizeDiagnosticValue(environment.architecture)}`,
    `Failure reason: ${sanitizeDiagnosticValue(failure?.reason ?? diagnosticsKind)}`,
    `Backend boundary code: ${sanitizeDiagnosticValue(failure?.backendBoundaryCode)}`,
    `Backend boundary stage: ${sanitizeDiagnosticValue(failure?.backendBoundaryStage)}`,
    `Missing resources: ${missingResources.length > 0 ? missingResources.join(', ') : 'not_reported'}`,
  ].join('\n');
}

export function buildStartupSupportIssueUrl(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind,
  failure: BackendStartupFailureInfo | undefined,
  environment: StartupSupportEnvironment
): string {
  const reason = failure?.reason ?? diagnosticsKind;
  const title = t('common.backendStartup.supportIssue.title');
  const body = t('common.backendStartup.supportIssue.body', {
    version: environment.appVersion,
    platform: environment.platform,
    architecture: environment.architecture,
    reason,
    boundaryCode: failure?.backendBoundaryCode ?? 'not_reported',
    boundaryStage: failure?.backendBoundaryStage ?? 'not_reported',
    missingResources: getSafeMissingResources(failure?.missingResources).join(', ') || 'not_reported',
  });
  return buildOplAppIssueUrl(getOplGlobalFeedbackIssueUrl(), title, body);
}

async function readStartupSupportEnvironment(failure?: BackendStartupFailureInfo): Promise<StartupSupportEnvironment> {
  const configuredVersion = __OPL_RELEASE_VERSION__ || __APP_VERSION__;
  let environment: StartupSupportEnvironment = {
    appVersion: configuredVersion || 'unknown',
    platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'unknown',
    architecture: failure?.deviceArch ?? 'unknown',
  };

  try {
    const appInfo = await ipcBridge.application.getDesktopAppInfo.invoke();
    environment = {
      appVersion: configuredVersion || appInfo.version || 'unknown',
      platform: appInfo.platform,
      architecture: appInfo.arch,
    };
  } catch (error) {
    console.warn('[InstallationIntegrityDialog] Failed to read desktop app info:', error);
  }

  return environment;
}

export async function openStartupSupport(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind,
  failure?: BackendStartupFailureInfo
): Promise<void> {
  const environment = await readStartupSupportEnvironment(failure);
  await openExternalUrl(buildStartupSupportIssueUrl(t, diagnosticsKind, failure, environment));
}

export async function copyDiagnosticsText(
  diagnosticsKind: InstallationIntegrityDialogKind,
  failure?: BackendStartupFailureInfo
): Promise<void> {
  const environment = await readStartupSupportEnvironment(failure);
  await copyText(buildStartupDiagnosticSummary(diagnosticsKind, failure, environment));
}

export async function openAppLogDirectory(): Promise<void> {
  const openLogs = window.electronAPI?.openAppLogDirectory;
  if (!openLogs) {
    throw new Error('app_log_directory_action_unavailable');
  }
  await openLogs();
}

export type BackendStartupFailureDialogRoute =
  | { kind: 'incompatible_runtime' }
  | { kind: 'package_architecture_mismatch' }
  | { kind: 'installation_integrity'; diagnosticsKind: InstallationIntegrityDialogKind };

export function getBackendStartupFailureDialogRoute(
  failure: BackendStartupFailureInfo | null | undefined
): BackendStartupFailureDialogRoute | null {
  if (!failure) return null;

  const reason = failure.reason;
  switch (reason) {
    case 'backend_incompatible_runtime':
      return { kind: 'incompatible_runtime' };
    case 'backend_package_architecture_mismatch':
      return { kind: 'package_architecture_mismatch' };
    case 'backend_incomplete_installation':
      return { kind: 'installation_integrity', diagnosticsKind: 'incomplete_installation' };
    case 'backend_recoverable_database_corruption':
      return { kind: 'installation_integrity', diagnosticsKind: 'recoverable_database_corruption' };
    case 'backend_transient_concurrent_startup':
      return { kind: 'installation_integrity', diagnosticsKind: 'transient_concurrent_startup' };
    case 'backend_startup_directory_unavailable':
      return {
        kind: 'installation_integrity',
        diagnosticsKind:
          failure.startupDirectoryIssueKind === 'permission_denied'
            ? 'startup_directory_permission_denied'
            : 'startup_directory_unavailable',
      };
    case 'backend_startup_exited':
      return { kind: 'installation_integrity', diagnosticsKind: 'backend_exited' };
    case 'backend_startup_pending_slow':
      return null;
    case 'backend_startup_failed':
      return { kind: 'installation_integrity', diagnosticsKind: 'generic_startup_failure' };
    default: {
      const unhandledReason: never = reason;
      void unhandledReason;
      return { kind: 'installation_integrity', diagnosticsKind: 'generic_startup_failure' };
    }
  }
}

export function getInstallationIntegrityTitle(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  switch (diagnosticsKind) {
    case 'recoverable_database_corruption':
      return t('common.backendStartup.recoverableDatabaseCorruption.title');
    case 'transient_concurrent_startup':
      return t('common.backendStartup.transientConcurrentStartup.title');
    case 'startup_directory_permission_denied':
    case 'startup_directory_unavailable':
      return t('common.backendStartup.startupDirectory.title');
    case 'generic_startup_failure':
      return t('common.backendStartup.genericFailure.title');
    case 'backend_exited':
      return t('common.backendStartup.exited.title');
    case 'incomplete_installation':
      return t('common.backendStartup.incompleteInstallation.title');
  }
}

export function getBackendStartupInstallationDescription(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.description');
}

export function getInstallationIntegrityDescription(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind
): string {
  switch (diagnosticsKind) {
    case 'recoverable_database_corruption':
      return t('common.backendStartup.recoverableDatabaseCorruption.description');
    case 'transient_concurrent_startup':
      return t('common.backendStartup.transientConcurrentStartup.description');
    case 'startup_directory_permission_denied':
      return t('common.backendStartup.startupDirectory.permissionDeniedDescription');
    case 'startup_directory_unavailable':
      return t('common.backendStartup.startupDirectory.unavailableDescription');
    case 'generic_startup_failure':
      return t('common.backendStartup.genericFailure.description');
    case 'backend_exited':
      return t('common.backendStartup.exited.description');
    case 'incomplete_installation':
      return getBackendStartupInstallationDescription(t);
  }
}

export function getInstallationIntegritySecondaryText(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind
): string | undefined {
  switch (diagnosticsKind) {
    case 'recoverable_database_corruption':
      return t('common.backendStartup.recoverableDatabaseCorruption.diagnosticsHint');
    case 'transient_concurrent_startup':
      return t('common.backendStartup.transientConcurrentStartup.action');
    case 'startup_directory_permission_denied':
      return t('common.backendStartup.startupDirectory.permissionDeniedAction');
    case 'startup_directory_unavailable':
      return t('common.backendStartup.startupDirectory.unavailableAction');
    case 'generic_startup_failure':
      return t('common.backendStartup.genericFailure.action');
    case 'backend_exited':
      return t('common.backendStartup.exited.action');
    case 'incomplete_installation':
      return undefined;
  }
}

export function getRuntimeComponentInstallationDescription(t: TFunction, resource: string): string {
  return t('common.backendStartup.incompleteInstallation.runtimeComponentDescription', { resource });
}

export function getInstallationIntegrityDownloadText(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.downloadLatest');
}

export function getDownloadLatestModalActionProps(t: TFunction): {
  cancelButtonProps: {
    style: {
      display: 'none';
    };
  };
  okText: string;
  onOk: () => void;
} {
  return {
    okText: getInstallationIntegrityDownloadText(t),
    onOk: openDownloadLatest,
    cancelButtonProps: {
      style: {
        display: 'none',
      },
    },
  };
}

export function getInstallationIntegrityModalActions(
  t: TFunction,
  options: {
    diagnosticsKind?: InstallationIntegrityDialogKind;
    failure?: BackendStartupFailureInfo;
    onDownloadLatest?: () => void;
    onCopyDiagnostics?: () => Promise<unknown> | void;
    onOpenLogDirectory?: () => Promise<unknown> | void;
    onOpenSupport?: () => Promise<unknown> | void;
    onRecoverCorruptedDatabase?: () => Promise<unknown> | void;
    onRestartApplication?: () => Promise<unknown> | void;
  } = {}
): {
  downloadText?: string;
  copyDiagnosticsText: string;
  onDownloadLatest: () => void;
  onCopyDiagnostics: () => Promise<unknown> | void;
  onOpenLogDirectory: () => Promise<unknown> | void;
  onOpenSupport: () => Promise<unknown> | void;
  onRecoverCorruptedDatabase: () => Promise<unknown> | void;
  onRestartApplication: () => Promise<unknown> | void;
  restartText?: string;
  recoverText?: string;
  openLogDirectoryText: string;
  supportText: string;
} {
  const diagnosticsKind = options.diagnosticsKind ?? 'incomplete_installation';
  return {
    downloadText: diagnosticsKind === 'incomplete_installation' ? getInstallationIntegrityDownloadText(t) : undefined,
    copyDiagnosticsText: t('common.backendStartup.actions.copyDiagnostics'),
    onDownloadLatest: options.onDownloadLatest ?? openDownloadLatest,
    onCopyDiagnostics: options.onCopyDiagnostics ?? (() => copyDiagnosticsText(diagnosticsKind, options.failure)),
    onOpenLogDirectory: options.onOpenLogDirectory ?? openAppLogDirectory,
    onOpenSupport: options.onOpenSupport ?? (() => openStartupSupport(t, diagnosticsKind, options.failure)),
    onRecoverCorruptedDatabase: options.onRecoverCorruptedDatabase ?? (() => Promise.resolve()),
    onRestartApplication: options.onRestartApplication ?? (() => ipcBridge.application.restart.invoke()),
    restartText:
      diagnosticsKind === 'incomplete_installation'
        ? t('common.backendStartup.actions.restartAndRecheck')
        : diagnosticsKind === 'startup_directory_permission_denied' ||
            diagnosticsKind === 'startup_directory_unavailable' ||
            diagnosticsKind === 'transient_concurrent_startup' ||
            diagnosticsKind === 'backend_exited' ||
            diagnosticsKind === 'generic_startup_failure'
          ? t('common.backendStartup.actions.restartApp')
          : undefined,
    recoverText:
      diagnosticsKind === 'recoverable_database_corruption'
        ? t('common.backendStartup.recoverableDatabaseCorruption.confirmRebuild')
        : undefined,
    openLogDirectoryText: t('common.backendStartup.actions.openLogDirectory'),
    supportText: t('common.backendStartup.actions.openSupport'),
  };
}

export const InstallationIntegrityContent: React.FC<{
  description: string;
  secondaryText?: string;
  missingResources?: string[];
}> = ({ description, secondaryText, missingResources }) => {
  const { t } = useTranslation();
  const safeMissingResources = getSafeMissingResources(missingResources);

  return (
    <div className='text-t-1'>
      <Typography.Paragraph className='mb-0 text-t-secondary'>{description}</Typography.Paragraph>
      {safeMissingResources.length > 0 ? (
        <div className='mt-12px'>
          <Typography.Text className='text-12px text-t-secondary'>
            {t('common.backendStartup.incompleteInstallation.missingResources')}
          </Typography.Text>
          <ul className='mt-6px mb-0 pl-20px text-12px text-t-tertiary'>
            {safeMissingResources.map((resource) => (
              <li key={resource}>
                <code>{resource}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {secondaryText ? (
        <Typography.Paragraph className='mt-12px mb-0 text-12px text-t-tertiary'>{secondaryText}</Typography.Paragraph>
      ) : null}
    </div>
  );
};

const InstallationIntegrityFooter: React.FC<{
  diagnosticsKind: InstallationIntegrityDialogKind;
  failure?: BackendStartupFailureInfo;
}> = ({ diagnosticsKind, failure }) => {
  const { t } = useTranslation();
  const [recovering, setRecovering] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [copyingDiagnostics, setCopyingDiagnostics] = useState(false);
  const [openingLogDirectory, setOpeningLogDirectory] = useState(false);
  const [openingSupport, setOpeningSupport] = useState(false);
  const actions = getInstallationIntegrityModalActions(t, {
    diagnosticsKind,
    failure,
    onRecoverCorruptedDatabase: () => window.electronAPI?.recoverCorruptedDatabase?.(),
  });

  const handleOpenSupport = async () => {
    if (openingSupport) return;
    setOpeningSupport(true);
    try {
      await actions.onOpenSupport();
    } catch (error) {
      console.error('[InstallationIntegrityDialog] Failed to open OPL support:', error);
      Message.error(t('common.backendStartup.actions.openSupportFailed'));
    } finally {
      setOpeningSupport(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    if (copyingDiagnostics) return;
    setCopyingDiagnostics(true);
    try {
      await actions.onCopyDiagnostics();
      Message.success(t('common.backendStartup.actions.copyDiagnosticsSucceeded'));
    } catch (error) {
      console.error('[InstallationIntegrityDialog] Failed to copy diagnostics:', error);
      Message.error(t('common.backendStartup.actions.copyDiagnosticsFailed'));
    } finally {
      setCopyingDiagnostics(false);
    }
  };

  const handleOpenLogDirectory = async () => {
    if (openingLogDirectory) return;
    setOpeningLogDirectory(true);
    try {
      await actions.onOpenLogDirectory();
    } catch (error) {
      console.error('[InstallationIntegrityDialog] Failed to open log directory:', error);
      Message.error(t('common.backendStartup.actions.openLogDirectoryFailed'));
    } finally {
      setOpeningLogDirectory(false);
    }
  };

  const handleRecoverCorruptedDatabase = async () => {
    if (recovering) return;
    setRecovering(true);
    try {
      await actions.onRecoverCorruptedDatabase();
    } catch {
      Message.error(t('common.backendStartup.recoverableDatabaseCorruption.rebuildFailed'));
      setRecovering(false);
    }
  };

  const handleRestartApplication = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await actions.onRestartApplication();
    } catch {
      Message.error(t('common.backendStartup.actions.restartFailed'));
      setRestarting(false);
    }
  };

  return (
    <Space wrap>
      {actions.recoverText ? (
        <Button
          data-testid='recoverable-database-corruption-rebuild'
          icon={<Refresh size='16' />}
          loading={recovering}
          type='primary'
          onClick={handleRecoverCorruptedDatabase}
        >
          {actions.recoverText}
        </Button>
      ) : null}
      {actions.restartText ? (
        <Button icon={<Refresh size='16' />} type='primary' loading={restarting} onClick={handleRestartApplication}>
          {actions.restartText}
        </Button>
      ) : null}
      {actions.downloadText ? (
        <Button icon={<Download size='16' />} onClick={actions.onDownloadLatest}>
          {actions.downloadText}
        </Button>
      ) : null}
      <Button
        icon={<FolderOpen size='16' />}
        loading={openingLogDirectory}
        onClick={() => void handleOpenLogDirectory()}
      >
        {actions.openLogDirectoryText}
      </Button>
      <Button icon={<Copy size='16' />} loading={copyingDiagnostics} onClick={() => void handleCopyDiagnostics()}>
        {actions.copyDiagnosticsText}
      </Button>
      <Button icon={<Help size='16' />} loading={openingSupport} onClick={() => void handleOpenSupport()}>
        {actions.supportText}
      </Button>
    </Space>
  );
};

type InstallationIntegrityModalController = ReturnType<typeof Modal.useModal>[0];

export function showInstallationIntegrityModal(
  modal: InstallationIntegrityModalController,
  t: TFunction,
  description: string,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation',
  failure?: BackendStartupFailureInfo
): ReturnType<InstallationIntegrityModalController['error']> {
  const secondaryText = getInstallationIntegritySecondaryText(t, diagnosticsKind);

  return modal.error({
    title: getInstallationIntegrityTitle(t, diagnosticsKind),
    content: (
      <InstallationIntegrityContent
        description={description}
        secondaryText={secondaryText}
        missingResources={failure?.missingResources}
      />
    ),
    footer: <InstallationIntegrityFooter diagnosticsKind={diagnosticsKind} failure={failure} />,
    closable: false,
    maskClosable: false,
  });
}

export const InstallationIntegrityModalHost: React.FC<{
  description: string;
  diagnosticsKind?: InstallationIntegrityDialogKind;
  failure?: BackendStartupFailureInfo;
}> = ({ description, diagnosticsKind = 'incomplete_installation', failure }) => {
  const [modal, modalContextHolder] = Modal.useModal();
  const { t } = useTranslation();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    showInstallationIntegrityModal(modal, t, description, diagnosticsKind, failure);
  }, [description, diagnosticsKind, failure, modal, t]);

  return <>{modalContextHolder}</>;
};
