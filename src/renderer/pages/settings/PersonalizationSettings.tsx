import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Radio, Space, Typography } from '@arco-design/web-react';
import { Disk, UpdateRotation } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import {
  dispatchOplBrandNameChanged,
  normalizeOplBrandName,
  OPL_DEFAULT_BRAND_NAME,
} from '@/renderer/hooks/system/useOplBrandName';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import OplAppearanceThemeSettings from './OplAppearanceThemeSettings';

type OplInteractionLayer = 'codex' | 'hermes';

type SettingRowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  alignTop?: boolean;
};

const TextArea = Input.TextArea;

const INSTRUCTION_FILE_BY_LAYER: Record<OplInteractionLayer, string> = {
  codex: '.codex/AGENTS.md',
  hermes: '.hermes/SOUL.md',
};

function normalizeInteractionLayer(value: unknown): OplInteractionLayer {
  return value === 'hermes' ? 'hermes' : 'codex';
}

function joinHomePath(home: string, relativePath: string): string {
  return `${home.replace(/\/$/, '')}/${relativePath}`;
}

const SettingRow: React.FC<SettingRowProps> = ({ title, description, children, alignTop = false }) => {
  return (
    <div
      className={`flex flex-col gap-12px px-16px py-14px md:flex-row md:justify-between md:gap-24px ${alignTop ? 'md:items-start' : 'md:items-center'}`}
    >
      <div className='min-w-0 md:max-w-360px'>
        <Typography.Text className='block text-14px font-500 text-t-primary'>{title}</Typography.Text>
        {description && (
          <Typography.Text className='block text-12px text-t-secondary mt-3px'>{description}</Typography.Text>
        )}
      </div>
      <div className='min-w-0 md:min-w-320px md:max-w-520px'>{children}</div>
    </div>
  );
};

const PersonalizationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const [brandName, setBrandName] = useState(OPL_DEFAULT_BRAND_NAME);
  const [interactionLayer, setInteractionLayer] = useState<OplInteractionLayer>('codex');
  const [homePath, setHomePath] = useState<string>('');
  const [instructionContent, setInstructionContent] = useState('');
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [instructionsSaving, setInstructionsSaving] = useState(false);

  const instructionPath = useMemo(() => {
    if (!homePath) return '';
    return joinHomePath(homePath, INSTRUCTION_FILE_BY_LAYER[interactionLayer]);
  }, [homePath, interactionLayer]);

  useEffect(() => {
    ConfigStorage.get('opl.brandName')
      .then((value) => setBrandName(normalizeOplBrandName(value)))
      .catch(() => setBrandName(OPL_DEFAULT_BRAND_NAME));
    ConfigStorage.get('opl.interactionLayer')
      .then((value) => setInteractionLayer(normalizeInteractionLayer(value)))
      .catch(() => setInteractionLayer('codex'));
    ipcBridge.application.getPath
      .invoke({ name: 'home' })
      .then(setHomePath)
      .catch(() => setHomePath(''));
  }, []);

  const loadInstructionFile = useCallback(
    async (showError = false) => {
      if (!instructionPath) return;
      setInstructionsLoading(true);
      try {
        const content = await ipcBridge.fs.readFile.invoke({ path: instructionPath });
        setInstructionContent(content || '');
      } catch {
        setInstructionContent('');
        if (showError) {
          message.warning(t('settings.personalizationPage.messages.instructionsLoadFailed'));
        }
      } finally {
        setInstructionsLoading(false);
      }
    },
    [instructionPath, message, t]
  );

  useEffect(() => {
    void loadInstructionFile(false);
  }, [loadInstructionFile]);

  const saveBrandName = useCallback(() => {
    const normalized = normalizeOplBrandName(brandName);
    setBrandName(normalized);
    ConfigStorage.set('opl.brandName', normalized)
      .then(() => {
        dispatchOplBrandNameChanged();
        message.success(t('settings.personalizationPage.messages.brandNameSaved'));
      })
      .catch(() => message.error(t('settings.personalizationPage.messages.brandNameSaveFailed')));
  }, [brandName, message, t]);

  const saveInteractionLayer = useCallback(
    async (nextLayer: OplInteractionLayer) => {
      setInteractionLayer(nextLayer);
      await Promise.all([
        ConfigStorage.set('opl.interactionLayer', nextLayer),
        ConfigStorage.set('guid.lastSelectedAgent', nextLayer),
      ]);
      message.success(t('settings.personalizationPage.messages.interactionLayerSaved'));
    },
    [message, t]
  );

  const saveInstructionFile = useCallback(async () => {
    if (!instructionPath) return;
    setInstructionsSaving(true);
    try {
      await ipcBridge.fs.writeFile.invoke({ path: instructionPath, data: instructionContent });
      message.success(t('settings.personalizationPage.messages.instructionsSaved'));
    } catch {
      message.error(t('settings.personalizationPage.messages.instructionsSaveFailed'));
    } finally {
      setInstructionsSaving(false);
    }
  }, [instructionContent, instructionPath, message, t]);

  return (
    <SettingsPageWrapper contentClassName='max-w-760px'>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.personalizationPage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>
            {t('settings.personalizationPage.description')}
          </Typography.Text>
        </div>

        <div className='rounded-10px border border-solid border-border-1 bg-bg-1 divide-y divide-border-1 overflow-hidden'>
          <SettingRow
            title={t('settings.personalizationPage.brandTitle')}
            description={t('settings.personalizationPage.brandDescription')}
          >
            <Input
              value={brandName}
              placeholder={OPL_DEFAULT_BRAND_NAME}
              onChange={setBrandName}
              onBlur={saveBrandName}
              onPressEnter={saveBrandName}
            />
          </SettingRow>

          <SettingRow
            title={t('settings.personalizationPage.appearanceTitle')}
            description={t('settings.personalizationPage.appearanceDescription')}
          >
            <OplAppearanceThemeSettings />
          </SettingRow>

          <SettingRow
            title={t('settings.personalizationPage.interactionTitle')}
            description={t('settings.personalizationPage.interactionDescription')}
          >
            <Radio.Group
              type='button'
              size='small'
              mode='outline'
              value={interactionLayer}
              options={[
                { label: t('settings.personalizationPage.interactionCodex'), value: 'codex' },
                { label: t('settings.personalizationPage.interactionHermes'), value: 'hermes' },
              ]}
              onChange={(value) => void saveInteractionLayer(normalizeInteractionLayer(value))}
            />
          </SettingRow>

          <SettingRow
            alignTop
            title={t('settings.personalizationPage.instructionsTitle')}
            description={t('settings.personalizationPage.instructionsDescription')}
          >
            <div className='flex flex-col gap-10px'>
              <Typography.Text className='block text-12px text-t-tertiary break-all'>
                {instructionPath || t('settings.personalizationPage.instructionsPathLoading')}
              </Typography.Text>
              <TextArea
                value={instructionContent}
                disabled={instructionsLoading}
                autoSize={{ minRows: 8, maxRows: 18 }}
                onChange={setInstructionContent}
              />
              <Space wrap>
                <Button
                  size='small'
                  icon={<Disk theme='outline' />}
                  loading={instructionsSaving}
                  disabled={!instructionPath}
                  onClick={() => void saveInstructionFile()}
                >
                  {t('settings.personalizationPage.actions.saveInstructions')}
                </Button>
                <Button
                  size='small'
                  icon={<UpdateRotation theme='outline' />}
                  loading={instructionsLoading}
                  disabled={!instructionPath}
                  onClick={() => void loadInstructionFile(true)}
                >
                  {t('settings.personalizationPage.actions.reloadInstructions')}
                </Button>
              </Space>
            </div>
          </SettingRow>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default PersonalizationSettings;
