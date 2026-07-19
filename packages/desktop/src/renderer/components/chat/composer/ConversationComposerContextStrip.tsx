import React from 'react';
import { useTranslation } from 'react-i18next';

type ConversationComposerContextStripProps = {
  workspacePath?: string;
  branch?: string;
  activeCapabilityLabel?: string;
};

const ConversationComposerContextStrip: React.FC<ConversationComposerContextStripProps> = ({
  activeCapabilityLabel,
}) => {
  const { t } = useTranslation();
  if (!activeCapabilityLabel) return null;

  return (
    <div
      className='flex min-w-0 items-center px-8px pb-4px text-12px text-t-tertiary'
      data-testid='conversation-composer-context-strip'
    >
      <span className='min-w-0 max-w-full truncate' data-testid='composer-active-capability'>
        {t('guid.home.activeCapability', { capability: activeCapabilityLabel })}
      </span>
    </div>
  );
};

export default ConversationComposerContextStrip;
