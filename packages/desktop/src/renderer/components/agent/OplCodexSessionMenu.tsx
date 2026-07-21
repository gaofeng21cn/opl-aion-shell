/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { OPL_CHROME_ICON_PROPS } from '@/renderer/components/opl/oplChromeIcon';
import { Button, Dropdown } from '@arco-design/web-react';
import { Check, Refresh, Right } from '@icon-park/react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './OplCodexSessionMenu.module.css';

export type OplCodexSessionMenuChoice = {
  id: string;
  label: string;
  description?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type OplCodexSessionMenuProps = {
  autoFocusOnMount?: boolean;
  modelValue: string;
  modelChoices: OplCodexSessionMenuChoice[];
  reasoningValue: string;
  reasoningChoices: OplCodexSessionMenuChoice[];
  reasoningDisabled?: boolean;
  onReset: () => void;
  onRequestClose: () => void;
  resetDisabled?: boolean;
};

type SessionMenuGroup = 'model' | 'reasoning';

const ROOT_ITEM_SELECTOR = '[data-opl-session-root-item]:not([disabled])';
const CHOICE_SELECTOR = '[data-opl-session-choice]:not([disabled])';

const focusRelativeItem = (
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  selector: string
): boolean => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !container) return false;
  const items = Array.from(container.querySelectorAll<HTMLButtonElement>(selector));
  if (items.length === 0) return false;
  event.preventDefault();
  event.stopPropagation();
  const currentIndex = items.indexOf(event.currentTarget as HTMLButtonElement);
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus({ preventScroll: true });
  return true;
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className={styles.summaryRow}>
    <span className={styles.summaryLabel}>{label}</span>
    <span className={styles.summaryMeta}>
      <span className={styles.summaryValue}>{value}</span>
      <Right {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' className={styles.chevron} />
    </span>
  </span>
);

const ChoiceRow: React.FC<{ choice: OplCodexSessionMenuChoice }> = ({ choice }) => (
  <span className={styles.choiceRow}>
    <span className={styles.choiceCopy}>
      <span className={styles.choiceLabel}>{choice.label}</span>
      {choice.description && <span className={styles.choiceDescription}>{choice.description}</span>}
    </span>
    {choice.selected && (
      <Check {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' className={styles.choiceCheck} />
    )}
  </span>
);

const OplCodexSessionMenu: React.FC<OplCodexSessionMenuProps> = ({
  autoFocusOnMount = false,
  modelValue,
  modelChoices,
  reasoningValue,
  reasoningChoices,
  reasoningDisabled = false,
  onReset,
  onRequestClose,
  resetDisabled = false,
}) => {
  const { t } = useTranslation();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<SessionMenuGroup, HTMLButtonElement | null>>({ model: null, reasoning: null });
  const submenuRefs = useRef<Record<SessionMenuGroup, HTMLDivElement | null>>({ model: null, reasoning: null });
  const submenuKeyboardOpenRef = useRef(false);
  const [activeGroup, setActiveGroup] = useState<SessionMenuGroup | null>(null);

  useEffect(() => {
    if (!autoFocusOnMount) return undefined;
    const frame = requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>(ROOT_ITEM_SELECTOR)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusOnMount]);

  useEffect(() => {
    if (!activeGroup || !submenuKeyboardOpenRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      submenuRefs.current[activeGroup]
        ?.querySelector<HTMLButtonElement>(CHOICE_SELECTOR)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeGroup]);

  const closeSubmenu = (group: SessionMenuGroup, restoreFocus: boolean) => {
    setActiveGroup(null);
    submenuKeyboardOpenRef.current = false;
    if (restoreFocus) {
      requestAnimationFrame(() => groupRefs.current[group]?.focus({ preventScroll: true }));
    }
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, group?: SessionMenuGroup) => {
    if (focusRelativeItem(event, rootRef.current, ROOT_ITEM_SELECTOR)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
      return;
    }
    if (group && ['ArrowRight', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      submenuKeyboardOpenRef.current = true;
      setActiveGroup(group);
    }
  };

  const handleChoiceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, group: SessionMenuGroup) => {
    if (focusRelativeItem(event, submenuRefs.current[group], CHOICE_SELECTOR)) return;
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSubmenu(group, true);
    }
  };

  const selectChoice = (group: SessionMenuGroup, choice: OplCodexSessionMenuChoice) => {
    if (choice.disabled) return;
    choice.onSelect();
    closeSubmenu(group, false);
    onRequestClose();
  };

  const renderChoiceMenu = (group: SessionMenuGroup, choices: OplCodexSessionMenuChoice[], label: string) => (
    <div
      ref={(element) => {
        submenuRefs.current[group] = element;
      }}
      id={`${menuId}-${group}`}
      className={styles.submenu}
      role='menu'
      aria-label={label}
      data-testid={`opl-codex-session-menu-${group}-choices`}
    >
      {choices.map((choice) => (
        <Button
          key={choice.id}
          type='text'
          className={`${styles.menuItem} ${styles.choiceItem} ${choice.selected ? styles.selectedChoice : ''}`}
          role='menuitemradio'
          aria-checked={Boolean(choice.selected)}
          aria-disabled={choice.disabled || undefined}
          disabled={choice.disabled}
          data-opl-session-choice='true'
          data-testid={`opl-codex-session-menu-${group}-choice-${choice.id}`}
          onClick={() => selectChoice(group, choice)}
          onKeyDown={(event) => handleChoiceKeyDown(event, group)}
        >
          <ChoiceRow choice={choice} />
        </Button>
      ))}
    </div>
  );

  const renderSummaryItem = (
    group: SessionMenuGroup,
    label: string,
    value: string,
    choices: OplCodexSessionMenuChoice[],
    disabled = false
  ) => (
    <Dropdown
      trigger='click'
      disabled={disabled}
      popupVisible={activeGroup === group}
      onVisibleChange={(visible) => {
        if (disabled) return;
        if (!visible) submenuKeyboardOpenRef.current = false;
        setActiveGroup(visible ? group : null);
      }}
      triggerProps={{ position: 'right', autoAlignPopupMinWidth: true }}
      droplist={renderChoiceMenu(group, choices, label)}
    >
      <Button
        ref={(element) => {
          groupRefs.current[group] = element instanceof HTMLButtonElement ? element : null;
        }}
        type='text'
        className={styles.menuItem}
        role='menuitem'
        aria-haspopup='menu'
        aria-expanded={activeGroup === group}
        aria-controls={`${menuId}-${group}`}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-opl-session-root-item='true'
        data-testid={`opl-codex-session-menu-${group}`}
        onPointerDown={() => {
          submenuKeyboardOpenRef.current = false;
        }}
        onKeyDown={(event) => handleRootKeyDown(event, group)}
      >
        <SummaryRow label={label} value={value} />
      </Button>
    </Dropdown>
  );

  return (
    <div
      ref={rootRef}
      id={menuId}
      className={styles.menu}
      role='menu'
      aria-label={t('agent.sessionConfiguration.menuLabel')}
      data-testid='opl-codex-session-menu'
    >
      {renderSummaryItem('model', t('agent.sessionConfiguration.model'), modelValue, modelChoices)}
      {renderSummaryItem(
        'reasoning',
        t('agent.sessionConfiguration.reasoning'),
        reasoningValue,
        reasoningChoices,
        reasoningDisabled
      )}
      <div className={styles.separator} role='separator' />
      <Button
        type='text'
        className={`${styles.menuItem} ${styles.resetItem}`}
        role='menuitem'
        disabled={resetDisabled}
        aria-disabled={resetDisabled || undefined}
        data-opl-session-root-item='true'
        data-testid='opl-codex-session-menu-reset'
        onClick={() => {
          onReset();
          onRequestClose();
        }}
        onKeyDown={handleRootKeyDown}
      >
        <span className={styles.resetRow}>
          <span>{t('agent.sessionConfiguration.resetDefaults')}</span>
          <Refresh {...OPL_CHROME_ICON_PROPS} size={16} aria-hidden='true' />
        </span>
      </Button>
    </div>
  );
};

export default OplCodexSessionMenu;
