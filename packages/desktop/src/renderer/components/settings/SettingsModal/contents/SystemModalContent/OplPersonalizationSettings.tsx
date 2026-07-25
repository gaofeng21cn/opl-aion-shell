import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Input, Message, Modal } from '@arco-design/web-react';
import { EditTwo, MessageOne, Refresh } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function stringOrEmpty(value: unknown) {
  return typeof value === 'string' ? value : '';
}

const OplPersonalizationSettings: React.FC = () => {
  const { t } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [savedAdditionalContext] = useConfig('codex.oplAppSessionContextAdditional');

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

  const saveAdditionalInstructions = async () => {
    setContextSaving(true);
    try {
      await configService.set('codex.oplAppSessionContextAdditional', additionalContextDraft);
      Message.success(t('settings.personalization.additionalInstructionsSaved'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
    } finally {
      setContextSaving(false);
    }
  };

  const clearAdditionalInstructions = async () => {
    setContextSaving(true);
    try {
      await configService.set('codex.oplAppSessionContextAdditional', '');
      setAdditionalContextDraft('');
      Message.success(t('settings.personalization.additionalInstructionsCleared'));
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
    <div className='flex flex-col gap-20px' data-testid='settings-personalization-instructions'>
      <section className='opl-personalization-group' id='system-agents' data-testid='settings-system-agents-editor'>
        <div className='opl-personalization-group__header'>
          <div className='flex min-w-0 items-start gap-12px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
              <EditTwo theme='outline' size='16' />
            </span>
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
          </div>
          <div className='opl-personalization-group__actions'>
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
              icon={<Refresh theme='outline' size='16' fill='currentColor' />}
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
        <div className='opl-personalization-group__body'>
          {instructionsUnavailable ? (
            <div className='text-12px text-danger'>{t('settings.personalization.systemAgentsTooLarge')}</div>
          ) : (
            <Input.TextArea
              value={instructionsDraft}
              maxLength={256 * 1024}
              autoSize={{ minRows: 7, maxRows: 14 }}
              placeholder={t('settings.personalization.systemAgentsPlaceholder')}
              onChange={setInstructionsDraft}
            />
          )}
        </div>
      </section>

      <section
        className='opl-personalization-group'
        id='additional-instructions'
        data-testid='settings-additional-instructions-editor'
      >
        <div className='opl-personalization-group__header'>
          <div className='flex min-w-0 items-start gap-12px'>
            <span className='flex h-28px w-28px shrink-0 items-center justify-center text-t-secondary'>
              <MessageOne theme='outline' size='16' />
            </span>
            <div className='min-w-0'>
              <div className='text-14px font-medium text-t-primary'>
                {t('settings.personalization.additionalInstructionsTitle')}
              </div>
              <div className='mt-2px text-12px text-t-tertiary leading-18px'>
                {t('settings.personalization.additionalInstructionsDescription')}
              </div>
            </div>
          </div>
        </div>
        <div className='opl-personalization-group__body'>
          <div className='text-12px font-medium text-t-secondary'>
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
          <div className='mt-10px flex flex-wrap items-center justify-between gap-12px'>
            <div className='text-12px text-t-tertiary'>{t('settings.personalization.nextConversationEffect')}</div>
            <div className='flex shrink-0 items-center gap-8px'>
              <Button
                size='small'
                loading={contextSaving}
                disabled={!additionalContextDraft && !savedAdditionalContext}
                onClick={() => void clearAdditionalInstructions()}
              >
                {t('settings.personalization.clearAdditionalInstructions')}
              </Button>
              <Button
                size='small'
                type='primary'
                loading={contextSaving}
                disabled={!contextChanged}
                onClick={() => void saveAdditionalInstructions()}
                data-testid='settings-additional-instructions-save'
              >
                {t('settings.personalization.save')}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OplPersonalizationSettings;
