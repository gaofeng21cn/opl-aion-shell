import { Alert, Button, Modal, Spin, Tag, Typography } from '@arco-design/web-react';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { resolveLocaleKey } from '@/common/utils';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { resolveOplHomeAppContributions, type OplHomeAppContribution } from './utils/oplHomeAssistants';
import styles from './index.module.css';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function localizedText(values: Partial<Record<'zh-CN' | 'en-US', string>>, localeKey: 'zh-CN' | 'en-US'): string {
  return values[localeKey] ?? values['en-US'] ?? values['zh-CN'] ?? '';
}

function contributionResult(result: IOplRuntimeCommandResult): unknown {
  if (result.ok === false) throw new Error(result.error?.message || result.command);
  const root = isRecord(result.parsed) ? result.parsed : {};
  const contribution = isRecord(root.opl_app_contribution) ? root.opl_app_contribution : {};
  const response = isRecord(contribution.response) ? contribution.response : {};
  if (response.ok !== true) throw new Error('Package contribution did not return a successful owner response.');
  return response.result;
}

function Value({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactNode {
  if (value === null || value === undefined) return <Typography.Text type='secondary'>-</Typography.Text>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <Typography.Text className={styles.packageContributionScalar}>{String(value)}</Typography.Text>;
  }
  if (depth >= 4) return <Typography.Text type='secondary'>...</Typography.Text>;
  if (Array.isArray(value)) {
    return (
      <ul className={styles.packageContributionList}>
        {value.map((entry, index) => (
          <li key={index}>
            <Value value={entry} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) {
    return (
      <dl className={styles.packageContributionFields}>
        {Object.entries(value).map(([key, entry]) => (
          <div className={styles.packageContributionField} key={key}>
            <dt>{key}</dt>
            <dd>
              <Value value={entry} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <Typography.Text type='secondary'>{String(value)}</Typography.Text>;
}

function findContribution(appState: unknown, packageId: string, navigationId: string): OplHomeAppContribution | null {
  return (
    resolveOplHomeAppContributions(appState).find(
      (entry) => entry.package_id === packageId && entry.navigation_id === navigationId
    ) ?? null
  );
}

const PackageContributionPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { packageId = '', navigationId = '' } = useParams();
  const appStateQuery = useOplAppState('fast');
  const localeKey = resolveLocaleKey(i18n.language);
  const contribution = useMemo(
    () => findContribution(appStateQuery.appState, packageId, navigationId),
    [appStateQuery.appState, navigationId, packageId]
  );
  const [value, setValue] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executingCommandId, setExecutingCommandId] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!contribution || !contribution.installed) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await ipcBridge.oplRuntime.runPackageContribution.invoke({
        packageId: contribution.package_id,
        ref: contribution.view.dataRef,
        operation: 'read',
      });
      setValue(contributionResult(result));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setValue(null);
    } finally {
      setLoading(false);
    }
  }, [contribution]);

  useEffect(() => {
    setValue(null);
    setLoadError(null);
    setCommandResult(null);
    void load();
  }, [load]);

  const execute = useCallback(
    async (commandId: string) => {
      const command = contribution?.commands.find((candidate) => candidate.commandId === commandId);
      if (!contribution || !command) return;
      setExecutingCommandId(commandId);
      setLoadError(null);
      try {
        const result = await ipcBridge.oplRuntime.runPackageContribution.invoke({
          packageId: contribution.package_id,
          ref: command.actionRef,
          operation: 'execute',
          confirmed: command.confirmationRequired === true,
        });
        setCommandResult(contributionResult(result));
        await load();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        setExecutingCommandId(null);
      }
    },
    [contribution, load]
  );

  const requestExecution = useCallback(
    (commandId: string) => {
      const command = contribution?.commands.find((candidate) => candidate.commandId === commandId);
      if (!command) return;
      if (command.confirmationRequired) {
        Modal.confirm({
          title: localizedText(command.labelI18n, localeKey),
          content: contribution?.view.dataRef,
          okText: t('common.confirm'),
          cancelText: t('common.cancel'),
          onOk: () => execute(commandId),
        });
        return;
      }
      void execute(commandId);
    },
    [contribution, execute, localeKey, t]
  );

  const title = contribution ? localizedText(contribution.view.titleI18n, localeKey) : t('common.error');
  const unavailable = !contribution || !contribution.installed;
  return (
    <main className={styles.packageContributionPage} data-testid='opl-package-contribution-page'>
      <header className={styles.packageContributionHeader}>
        <Button
          type='text'
          icon={<OplIcon name='chevronLeft' />}
          aria-label={t('common.back')}
          onClick={() => void navigate('/guid')}
          data-testid='opl-package-contribution-back'
        />
        <div className={styles.packageContributionTitle}>
          <Typography.Title heading={4}>{title}</Typography.Title>
          {contribution && <Tag>{contribution.view.viewType}</Tag>}
        </div>
        {!unavailable && (
          <Button
            type='text'
            icon={<OplIcon name='refresh' />}
            loading={loading}
            aria-label={t('common.refresh')}
            onClick={() => void load()}
            data-testid='opl-package-contribution-refresh'
          />
        )}
      </header>

      {unavailable ? (
        <Alert
          type='info'
          showIcon
          content={t('common.runtime.snapshotUnavailableDescription')}
          data-testid='opl-package-contribution-unavailable'
        />
      ) : loading ? (
        <div className={styles.packageContributionState} data-testid='opl-package-contribution-loading'>
          <Spin tip={t('common.loading')} />
        </div>
      ) : loadError ? (
        <Alert type='error' showIcon content={loadError} data-testid='opl-package-contribution-error' />
      ) : (
        <section className={styles.packageContributionContent} data-testid='opl-package-contribution-result'>
          {value === null ? (
            <Typography.Text type='secondary'>
              {localizedText(contribution.view.emptyStateI18n ?? {}, localeKey) ||
                t('common.runtime.snapshotUnavailable')}
            </Typography.Text>
          ) : (
            <Value value={value} />
          )}
        </section>
      )}

      {contribution && contribution.commands.length > 0 && (
        <section className={styles.packageContributionCommands} data-testid='opl-package-contribution-commands'>
          {contribution.commands.map((command) => (
            <Button
              key={command.commandId}
              type='secondary'
              loading={executingCommandId === command.commandId}
              onClick={() => requestExecution(command.commandId)}
              data-testid={`opl-package-contribution-command-${command.commandId}`}
            >
              {localizedText(command.labelI18n, localeKey)}
            </Button>
          ))}
        </section>
      )}
      {commandResult !== null && (
        <section
          className={styles.packageContributionCommandResult}
          data-testid='opl-package-contribution-command-result'
        >
          <Value value={commandResult} />
        </section>
      )}
    </main>
  );
};

export default PackageContributionPage;
