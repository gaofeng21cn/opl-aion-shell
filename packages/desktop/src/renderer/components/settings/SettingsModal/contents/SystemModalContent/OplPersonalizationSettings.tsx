import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getOplCodexSessionContextForLocale } from '@/common/config/oplProductProfile';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { oplRecord, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { Button, Input, Message, Radio } from '@arco-design/web-react';
import { EditTwo, Refresh } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ContextMode = 'automatic' | 'custom';

function stringOrEmpty(value: unknown) {
  return typeof value === 'string' ? value : '';
}

const OplPersonalizationSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const appStateQuery = useOplAppState('fast');
  const [savedContextMode] = useConfig('codex.oplAppSessionContextMode');
  const [savedCustomContext] = useConfig('codex.oplAppSessionContextCustom');
  const locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  const automaticContext = useMemo(() => getOplCodexSessionContextForLocale(locale), [locale]);

  const userInstructions = oplRecord(oplRecord(appStateQuery.appState.codex_personalization).user_agents);
  const loadedInstructions = stringOrEmpty(userInstructions.content);
  const loadedSha256 = typeof userInstructions.sha256 === 'string' ? userInstructions.sha256 : null;
  const instructionsStatus = stringOrEmpty(userInstructions.status);
  const instructionsPath = stringOrEmpty(userInstructions.path);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [contextModeDraft, setContextModeDraft] = useState<ContextMode>(savedContextMode ?? 'automatic');
  const [customContextDraft, setCustomContextDraft] = useState(savedCustomContext ?? '');
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    setInstructionsDraft(loadedInstructions);
  }, [loadedInstructions, loadedSha256]);

  useEffect(() => {
    setContextModeDraft(savedContextMode ?? 'automatic');
    setCustomContextDraft(savedCustomContext ?? '');
  }, [savedContextMode, savedCustomContext]);

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

  const saveSessionContext = async () => {
    setContextSaving(true);
    try {
      await configService.setBatch({
        'codex.oplAppSessionContextMode': contextModeDraft,
        'codex.oplAppSessionContextCustom': customContextDraft,
      });
      Message.success(t('settings.personalization.sessionContextSaved'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('settings.personalization.saveFailed'));
    } finally {
      setContextSaving(false);
    }
  };

  const selectContextMode = (value: ContextMode) => {
    setContextModeDraft(value);
    if (value === 'custom' && !customContextDraft.trim()) setCustomContextDraft(automaticContext);
  };

  const contextChanged =
    contextModeDraft !== (savedContextMode ?? 'automatic') || customContextDraft !== (savedCustomContext ?? '');
  const instructionsUnavailable = instructionsStatus === 'too_large';

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
          </div>
          <div className='flex shrink-0 items-center gap-8px'>
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
        <div className='flex min-w-0 flex-wrap items-start justify-between gap-12px'>
          <div className='min-w-0'>
            <div className='text-14px font-medium text-t-primary'>
              {t('settings.personalization.sessionContextTitle')}
            </div>
            <div className='mt-2px text-12px text-t-tertiary leading-18px'>
              {t('settings.personalization.sessionContextDescription')}
            </div>
          </div>
          <Radio.Group
            type='button'
            size='small'
            value={contextModeDraft}
            onChange={(value) => selectContextMode(value as ContextMode)}
          >
            <Radio value='automatic'>{t('settings.personalization.automatic')}</Radio>
            <Radio value='custom'>{t('settings.personalization.custom')}</Radio>
          </Radio.Group>
        </div>
        <Input.TextArea
          className='mt-12px'
          value={contextModeDraft === 'automatic' ? automaticContext : customContextDraft}
          readOnly={contextModeDraft === 'automatic'}
          autoSize={{ minRows: 9, maxRows: 16 }}
          onChange={setCustomContextDraft}
        />
        <div className='mt-10px flex items-center justify-between gap-12px'>
          <div className='text-12px text-t-tertiary'>{t('settings.personalization.nextConversationEffect')}</div>
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
    </section>
  );
};

export default OplPersonalizationSettings;
