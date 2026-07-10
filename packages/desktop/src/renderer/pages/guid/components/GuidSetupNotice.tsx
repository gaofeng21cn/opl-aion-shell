import { Button } from '@arco-design/web-react';
import { Info, Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

export type GuidSetupNoticeKind = 'local_assistant' | 'model_access' | 'workspace';

type GuidSetupNoticeProps = {
  kind: GuidSetupNoticeKind;
  onOpenSetup: () => void;
};

const GuidSetupNotice: React.FC<GuidSetupNoticeProps> = ({ kind, onOpenSetup }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.guidSetupNotice} data-testid='opl-guid-setup-notice' role='status' aria-live='polite'>
      <Info theme='outline' size='16' fill='currentColor' className={styles.guidSetupNoticeIcon} />
      <div className={styles.guidSetupNoticeCopy}>
        <strong>{t(`common.firstRunRecovery.notice.${kind}.title`)}</strong>
        <span>{t(`common.firstRunRecovery.notice.${kind}.description`)}</span>
      </div>
      <Button
        type='text'
        size='small'
        icon={<Right theme='outline' size='14' fill='currentColor' />}
        onClick={onOpenSetup}
        data-testid='opl-guid-setup-notice-action'
      >
        {t('common.firstRunRecovery.completeSetup')}
      </Button>
    </div>
  );
};

export default GuidSetupNotice;
