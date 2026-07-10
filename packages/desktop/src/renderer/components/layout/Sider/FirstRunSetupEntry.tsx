import classNames from 'classnames';
import { Tooltip } from '@arco-design/web-react';
import { Config } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCoreLaunchPrerequisites } from '@/renderer/hooks/system/useCoreLaunchPrerequisites';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

type FirstRunSetupEntryProps = {
  collapsed: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
};

const FirstRunSetupEntry: React.FC<FirstRunSetupEntryProps> = ({ collapsed, isMobile, onNavigate }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const readiness = useCoreLaunchPrerequisites();

  if (!readiness.known || readiness.readyToLaunch) return null;

  const label = t('common.firstRunRecovery.completeSetup');
  const tooltipProps = getSiderTooltipProps(collapsed && !isMobile);

  return (
    <Tooltip {...tooltipProps} content={label} position='right'>
      <button
        type='button'
        className={classNames(
          'mx-8px mb-8px box-border min-h-40px flex items-center gap-8px px-10px rd-0.5rem border border-solid border-[var(--color-border-2)] bg-fill-1 hover:bg-fill-2 active:bg-fill-3 text-t-primary cursor-pointer shrink-0 transition-colors',
          collapsed ? 'justify-center px-0' : 'justify-start'
        )}
        onClick={() => {
          void navigate('/first-run');
          onNavigate?.();
        }}
        data-testid='opl-first-run-resume-entry'
        aria-label={label}
      >
        <span className='size-22px flex items-center justify-center shrink-0 text-primary'>
          <Config theme='outline' size={collapsed ? '20' : '16'} fill='currentColor' />
        </span>
        {!collapsed && (
          <span className='min-w-0 text-left'>
            <span className='block text-13px font-[600] leading-18px'>{label}</span>
            <span className='block text-11px leading-16px text-t-secondary'>
              {t('common.firstRunRecovery.sidebarHint')}
            </span>
          </span>
        )}
      </button>
    </Tooltip>
  );
};

export default FirstRunSetupEntry;
