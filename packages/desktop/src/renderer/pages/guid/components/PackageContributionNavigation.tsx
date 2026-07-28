import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { OplHomeAppContribution } from '../utils/oplHomeAssistants';
import styles from '../index.module.css';

type PackageContributionNavigationProps = {
  contributions: OplHomeAppContribution[];
  localeKey: 'zh-CN' | 'en-US';
  onOpen: (contribution: OplHomeAppContribution) => void;
};

function localizedText(values: Partial<Record<'zh-CN' | 'en-US', string>>, localeKey: 'zh-CN' | 'en-US'): string {
  return values[localeKey] ?? values['en-US'] ?? values['zh-CN'] ?? '';
}

const PackageContributionNavigation: React.FC<PackageContributionNavigationProps> = ({
  contributions,
  localeKey,
  onOpen,
}) => {
  const { t } = useTranslation();
  if (contributions.length === 0) return null;

  return (
    <nav
      className={styles.packageContributionNavigation}
      aria-label={t('guid.home.startersLabel')}
      data-testid='opl-package-contribution-navigation'
    >
      {contributions.map((contribution) => {
        const label = localizedText(contribution.label_i18n, localeKey);
        if (!label) return null;
        return (
          <Button
            key={`${contribution.package_id}:${contribution.navigation_id}`}
            type='text'
            className={styles.packageContributionNavigationItem}
            onClick={() => onOpen(contribution)}
            data-opl-package-id={contribution.package_id}
            data-opl-contribution-view-id={contribution.view.viewId}
            data-testid={`opl-package-contribution-navigation-${contribution.package_id}-${contribution.navigation_id}`}
          >
            {label}
          </Button>
        );
      })}
    </nav>
  );
};

export default PackageContributionNavigation;
