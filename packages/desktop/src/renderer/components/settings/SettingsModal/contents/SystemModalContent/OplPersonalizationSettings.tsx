import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getOplCodexSessionContextForLocale } from '@/common/config/oplProductProfile';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Input, Message, Modal } from '@arco-design/web-react';
import { EditTwo, Refresh } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function stringOrEmpty(value: unknown) {
  return typeof value === 'string' ? value : '';
}

const OplPersonalizationSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [savedAdditionalContext] = useConfig('codex.oplAppSessionContextAdditional');
  const locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  const generatedContext = useMemo(() => getOplCodexSessionContextForLocale(locale), [locale]);

  const personalization = oplRecord(appStateQuery.appState.codex_personalization);
  const userInstructions = oplRecord(personalization.user_agents);
  const defaultUserInstructions = oplRecord(personalization.opl_flow_default_user_agents);
  const loadedInstructions = stringOrEmpty(userInstructions.content);
  const loadedSha256 = typeof userInstructions.sha256 === 'string' ? userInstructions.sha256 : null;
  const instructionsStatus = stringOrEmpty(userInstructions.status);
  const instructionsPath = stringOrEmpty(userInstructions.path);
  const defaultInstructionsStatus = stringOrEmpty(defaultUserInstructions.status);
  const defaultInstructionsSha256 = stringOrEmpty(defaultUserInstructions.sha256);
  const defaultInstructionsVersion = stringOrEmpty(defaultUserInstructions.package_version);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [instructionsRestoring, setInstructionsRestoring] = useState(false);
  const [additionalContextDraft, setAdditionalContextDraft] = useState(savedAdditionalContext ?? '');
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    setInstructionsDraft(loadedInstructions);
  }, [loadedInstructions, loadedSha256]);

  useEffect(() => {
    setAdditionalContextDraft(savedAdditionalContext ?? '');
  }, [savedAdditionalContext]);

  const saveInstructions = async () => {
    setInstructionsSaving(true);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'codex_user_instructions_set',
        dryRun: false,
        payloadJson: {
          content: instructionsDraft,
          expected_sha256: loadedSha256,
        },
      });
      if (result.ok === false) throw new Error(result.error?.message || t('settings.personalization.saveFailed'));
      await appStateQuery.load('fast', { showRefreshing: true });
      Message.success(t('settings.personalization.systemAgentsSaved'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
    } finally {
      setInstructionsSaving(false);
    }
  };

  const restoreInstructionsDefault = () => {
    Modal.confirm({
      title: t('settings.personalization.restoreSystemAgentsTitle'),
      content: t('settings.personalization.restoreSystemAgentsConfirm'),
      okText: t('settings.personalization.restoreOplFlowDefault'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setInstructionsRestoring(true);
        try {
          const result = await ipcBridge.oplRuntime.executeAction.invoke({
            actionId: 'codex_user_instructions_restore_opl_flow_default',
            dryRun: false,
            payloadJson: { expected_sha256: loadedSha256 },
          });
          if (result.ok === false) throw new Error(result.error?.message || t('settings.personalization.saveFailed'));
          await appStateQuery.load('fast', { showRefreshing: true });
          Message.success(t('settings.personalization.systemAgentsRestored'));
        } catch (error) {
          Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
          throw error;
        } finally {
          setInstructionsRestoring(false);
        }
      },
    });
  };

  const saveSessionContext = async () => {
    setContextSaving(true);
    try {
      await configService.set('codex.oplAppSessionContextAdditional', additionalContextDraft);
      Message.success(t('settings.personalization.sessionContextSaved'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
    } finally {
      setContextSaving(false);
    }
  };

  const restoreSessionContextDefault = async () => {
    setContextSaving(true);
    try {
      await configService.set('codex.oplAppSessionContextAdditional', '');
      setAdditionalContextDraft('');
      Message.success(t('settings.personalization.sessionContextRestored'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
    } finally {
      setContextSaving(false);
    }
  };

  const contextChanged = additionalContextDraft !== (savedAdditionalContext ?? '');
  const instructionsUnavailable = instructionsStatus === 'too_large';
  const defaultInstructionsAvailable = defaultInstructionsStatus === 'available' && Boolean(defaultInstructionsSha256);
  const instructionsAlreadyDefault = defaultInstructionsAvailable && loadedSha256 === defaultInstructionsSha256;

  return (
    <section className='opl-settings-section' id='instructions-context' data-testid='settings-preferences-instructions'>
      <span id='system-agents' aria-hidden='true' />
      <div className='opl-settings-section__header'>
        <div className='flex min-w-0 items-start gap-12px'>
          <span className='flex h-28px w-28px shrink-0 items-center justify-center rounded-6px bg-fill-2 text-t-secondary'>
            <EditTwo theme='outline' size='16' />
          </span>
          <div className='min-w-0'>
            <div className='text-14px font-medium text-t-primary leading-22px'>
              {t('settings.personalization.title')}
            </div>
            <div className='mt-2px text-12px text-t-tertiary leading-18px'>
              {t('settings.personalization.description')}
            </div>
          </div>
        </div>
      </div>

      <div
        className='border-t border-solid border-[var(--border-base)] p-16px'
        data-testid='settings-system-agents-editor'
      >
        <div className='flex min-w-0 flex-wrap items-start justify-between gap-12px'>
          <div className='min-w-0'>
            <div className='text-14px font-medium text-t-primary'>
              {t('settings.personalization.systemAgentsTitle')}
            </div>
            <div className='mt-2px text-12px text-t-tertiary leading-18px'>
              {t('settings.personalization.systemAgentsDescription')}
            </div>
            {instructionsPath && <div className='mt-4px break-all text-11px text-t-tertiary'>{instructionsPath}</div>}
            {defaultInstructionsAvailable ? (
              <div className='mt-2px text-11px text-t-tertiary'>
                {t('settings.personalization.oplFlowDefaultVersion', { version: defaultInstructionsVersion })}
              </div>
            ) : (
              defaultInstructionsStatus && (
                <div className='mt-2px text-11px text-warning'>
                  {t('settings.personalization.oplFlowDefaultUnavailable')}
                </div>
              )
            )}
          </div>
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-8px'>
            <Button
              size='small'
              loading={instructionsRestoring}
              disabled={!defaultInstructionsAvailable || instructionsAlreadyDefault}
              onClick={restoreInstructionsDefault}
            >
              {t('settings.personalization.restoreOplFlowDefault')}
            </Button>
            <Button
              size='small'
              icon={<Refresh theme='outline' />}
              loading={appStateQuery.refreshing}
              onClick={() => void appStateQuery.load('fast', { showRefreshing: true })}
            >
              {t('settings.personalization.reload')}
            </Button>
            <Button
              size='small'
              type='primary'
              loading={instructionsSaving}
              disabled={instructionsUnavailable || instructionsDraft === loadedInstructions}
              onClick={() => void saveInstructions()}
            >
              {t('settings.personalization.save')}
            </Button>
          </div>
        </div>
        {instructionsUnavailable ? (
          <div className='mt-12px text-12px text-danger'>{t('settings.personalization.systemAgentsTooLarge')}</div>
        ) : (
          <Input.TextArea
            className='mt-12px'
            value={instructionsDraft}
            maxLength={256 * 1024}
            autoSize={{ minRows: 7, maxRows: 14 }}
            placeholder={t('settings.personalization.systemAgentsPlaceholder')}
            onChange={setInstructionsDraft}
          />
        )}
      </div>

      <div
        className='border-t border-solid border-[var(--border-base)] p-16px'
        id='opl-app-context'
        data-testid='settings-opl-app-context-editor'
      >
        <div className='min-w-0'>
          <div className='text-14px font-medium text-t-primary'>
            {t('settings.personalization.sessionContextTitle')}
          </div>
          <div className='mt-2px text-12px text-t-tertiary leading-18px'>
            {t('settings.personalization.sessionContextDescription')}
          </div>
        </div>
        <div className='mt-12px text-12px font-medium text-t-secondary'>
          {t('settings.personalization.generatedContextLabel')}
        </div>
        <Input.TextArea className='mt-6px' value={generatedContext} readOnly autoSize={{ minRows: 9, maxRows: 16 }} />
        <div className='mt-12px text-12px font-medium text-t-secondary'>
          {t('settings.personalization.additionalContextLabel')}
        </div>
        <Input.TextArea
          className='mt-6px'
          value={additionalContextDraft}
          maxLength={64 * 1024}
          placeholder={t('settings.personalization.additionalContextPlaceholder')}
          autoSize={{ minRows: 4, maxRows: 10 }}
          onChange={setAdditionalContextDraft}
        />
        <div className='mt-10px flex items-center justify-between gap-12px'>
          <div className='text-12px text-t-tertiary'>{t('settings.personalization.nextConversationEffect')}</div>
          <div className='flex shrink-0 items-center gap-8px'>
            <Button
              size='small'
              loading={contextSaving}
              disabled={!additionalContextDraft && !savedAdditionalContext}
              onClick={() => void restoreSessionContextDefault()}
            >
              {t('settings.personalization.restoreDefault')}
            </Button>
            <Button
              size='small'
              type='primary'
              loading={contextSaving}
              disabled={!contextChanged}
              onClick={() => void saveSessionContext()}
            >
              {t('settings.personalization.save')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OplPersonalizationSettings;
