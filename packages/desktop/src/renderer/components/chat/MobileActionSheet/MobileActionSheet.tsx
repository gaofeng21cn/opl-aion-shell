/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './MobileActionSheet.module.css';
import type { MobileActionSheetEntry, MobileActionSheetProps, MobileActionSheetSubMenu } from './types';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';

const TRANSITION_MS = 260;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({ open, onClose, title, entries }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null);
  // Sub pane stays mounted briefly after deactivation so its slide-out animation
  // can play. `subPhase` drives the animation: 'enter' positions the sub pane
  // off-screen (right) before the next frame flips to 'shown', so the CSS
  // transition has a starting point.
  const [renderedSubKey, setRenderedSubKey] = useState<string | null>(null);
  const [subPhase, setSubPhase] = useState<'idle' | 'enter' | 'shown' | 'exit'>('idle');
  const [mounted, setMounted] = useState(false);
  // `visible` lags `mounted` by one paint so the sheet renders at
  // translateY(100%) first, then the next frame transitions to translateY(0).
  // Without this gap, applying .visible on first mount skips the slide-up
  // (perceived as a flash). Crucially we run the visibility flip in a
  // *separate* layout effect — coupling it to `mounted` (instead of `open`)
  // forces React to commit the off-screen frame before the rAF kicks in.
  const [visible, setVisible] = useState(false);
  const [inputModality, setInputModality] = useState<'keyboard' | 'pointer'>('keyboard');
  const inputModalityRef = useRef<'keyboard' | 'pointer'>('keyboard');
  const openRafRef = useRef<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const subPaneRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const returnEntryKeyRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handlePointerDown = () => {
      inputModalityRef.current = 'pointer';
    };
    const handleKeyDown = () => {
      inputModalityRef.current = 'keyboard';
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  // Mount / unmount lifecycle — drives DOM presence only.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setVisible(false);
    setActiveSubKey(null);
    const closeTimer = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(closeTimer);
  }, [open]);

  // Visibility lifecycle — flips `.visible` only after the off-screen frame
  // has been painted. Using useLayoutEffect with a `mounted` dependency
  // guarantees we observe the freshly committed DOM before scheduling the rAF;
  // this avoids React 18 batching collapsing mount + visible into one paint
  // (which produced the inconsistent "snap up" animation).
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setVisible(true));
      openRafRef.current = raf2;
    });
    openRafRef.current = raf1;
    return () => {
      if (openRafRef.current !== null) cancelAnimationFrame(openRafRef.current);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (activeSubKey) {
      setRenderedSubKey(activeSubKey);
      setSubPhase('enter');
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSubPhase('shown'));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (renderedSubKey) {
      setSubPhase('exit');
      const id = setTimeout(() => {
        setRenderedSubKey(null);
        setSubPhase('idle');
      }, TRANSITION_MS);
      return () => clearTimeout(id);
    }
  }, [activeSubKey, renderedSubKey]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const layer = layerRef.current;
    const sheet = sheetRef.current;
    if (!open || !mounted || !layer || !sheet) return undefined;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const autoFocusFirstAction = inputModalityRef.current === 'keyboard';
    setInputModality(inputModalityRef.current);
    const isolatedSiblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== layer)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        wasInert: element.hasAttribute('inert'),
      }));
    for (const { element } of isolatedSiblings) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }

    const focusable = () =>
      Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.closest('[hidden], [aria-hidden="true"], [inert]')
      );
    const focusWithinSheet = (target: HTMLElement) => {
      target.focus({ preventScroll: true });
      if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
    };
    focusWithinSheet(autoFocusFirstAction ? (focusable()[0] ?? sheet) : sheet);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (inputModalityRef.current !== 'keyboard') {
        inputModalityRef.current = 'keyboard';
        setInputModality('keyboard');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      const targets = focusable();
      if (event.key === 'Tab') {
        if (!targets.length) {
          event.preventDefault();
          focusWithinSheet(sheet);
          return;
        }
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          focusWithinSheet(last);
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          focusWithinSheet(first);
        }
        return;
      }

      if (!sheet.contains(document.activeElement) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const currentIndex = targets.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? targets.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1 + targets.length) % targets.length
              : (currentIndex - 1 + targets.length) % targets.length;
      const nextTarget = targets[nextIndex];
      if (nextTarget) focusWithinSheet(nextTarget);
    };
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      for (const { element, ariaHidden, wasInert } of isolatedSiblings) {
        if (!wasInert) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      const restoreFocus = restoreFocusRef.current;
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!activeSubKey || subPhase !== 'shown') return;
    const firstSubAction = subPaneRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstSubAction?.focus({ preventScroll: true });
  }, [activeSubKey, subPhase]);

  const activeEntry = activeSubKey ? entries.find((e) => e.key === activeSubKey) : null;
  const activeSub: MobileActionSheetSubMenu | undefined = activeEntry?.submenu;
  const renderedSubEntry = renderedSubKey ? entries.find((e) => e.key === renderedSubKey) : null;
  const renderedSub: MobileActionSheetSubMenu | undefined = renderedSubEntry?.submenu;

  if (!mounted) {
    return null;
  }

  const handleEntryClick = (entry: MobileActionSheetEntry) => {
    if (entry.disabled) return;
    if (entry.submenu) {
      returnEntryKeyRef.current = entry.key;
      setActiveSubKey(entry.key);
      return;
    }
    entry.onClick?.();
    onClose();
  };

  const handleSubSelect = (key: string) => {
    if (!activeSub) return;
    const option = activeSub.options.find((item) => item.key === key);
    if (option?.disabled) return;
    activeSub.onSelect(key);
    // For settings (model, permission) the user expects to see the new value
    // reflected on the main pane, so we slide back instead of dismissing the
    // sheet. For non-selectable submenus (skills, attach) the selection is
    // an action — close the sheet so the user can immediately interact with
    // the result (e.g. type a slash command, see attached files).
    if (activeSub.selectable !== false) {
      setActiveSubKey(null);
      requestAnimationFrame(focusReturnEntry);
      return;
    }
    onClose();
  };

  function focusReturnEntry() {
    const returnEntryTestId = returnEntryKeyRef.current ? `mobile-action-sheet-${returnEntryKeyRef.current}` : null;
    const returnEntry = returnEntryTestId
      ? Array.from(mainPaneRef.current?.querySelectorAll<HTMLElement>('[data-testid]') ?? []).find(
          (element) => element.dataset.testid === returnEntryTestId
        )
      : null;
    returnEntry?.focus({ preventScroll: true });
  }

  const handleBack = () => {
    setActiveSubKey(null);
    requestAnimationFrame(focusReturnEntry);
  };

  return createPortal(
    <div ref={layerRef} aria-hidden={open ? undefined : 'true'} data-testid='mobile-action-sheet-layer'>
      <div className={`${styles.mask} ${visible ? styles.visible : ''}`} onClick={onClose} aria-hidden='true' />
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${visible ? styles.visible : ''}`}
        role='dialog'
        aria-modal='true'
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : t('common.more', { defaultValue: 'More' })}
        data-input-modality={inputModality}
        tabIndex={-1}
        onPointerDown={() => {
          inputModalityRef.current = 'pointer';
          setInputModality('pointer');
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden='true' />
        <div className={styles.panes}>
          <div
            ref={mainPaneRef}
            className={`${styles.pane} ${styles.paneMain} ${subPhase === 'shown' ? styles.paneOutLeft : styles.paneActive}`}
            aria-hidden={subPhase === 'shown'}
          >
            {title && (
              <div className={styles.header} id={titleId}>
                {title}
              </div>
            )}
            <div className={styles.list}>
              {entries.map((entry, index) => (
                <Fragment key={entry.key}>
                  {entry.dividerBefore && index !== 0 && <div className={styles.divider} />}
                  <button
                    type='button'
                    className={`${styles.item} ${entry.disabled ? styles.disabled : ''}`}
                    onClick={() => handleEntryClick(entry)}
                    disabled={entry.disabled}
                    aria-controls={entry.submenu ? `${titleId}-submenu` : undefined}
                    aria-expanded={entry.submenu ? activeSubKey === entry.key : undefined}
                    data-testid={`mobile-action-sheet-${entry.key}`}
                  >
                    {entry.icon && (
                      <div className={`${styles.icon} ${entry.variant === 'muted' ? styles.muted : ''}`}>
                        {entry.icon}
                      </div>
                    )}
                    <div className={styles.body}>
                      <div className={styles.label}>{entry.label}</div>
                      {entry.description && <div className={styles.desc}>{entry.description}</div>}
                    </div>
                    {(entry.meta || entry.submenu || entry.trailingIcon) && (
                      <div className={styles.meta}>
                        {entry.meta && <span className={styles.metaText}>{entry.meta}</span>}
                        {entry.submenu && (
                          <OplIcon name='chevronRight' size={14} className={styles.chevron} aria-hidden='true' />
                        )}
                        {entry.trailingIcon && <span className={styles.chevron}>{entry.trailingIcon}</span>}
                      </div>
                    )}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>

          {renderedSub && (
            <div
              ref={subPaneRef}
              id={`${titleId}-submenu`}
              className={`${styles.pane} ${styles.paneSub} ${subPhase === 'shown' ? styles.paneActive : styles.paneOutRight}`}
              aria-hidden={subPhase !== 'shown'}
            >
              <div className={styles.subbar}>
                <button className={styles.back} onClick={handleBack} type='button'>
                  <OplIcon name='chevronLeft' aria-hidden='true' />
                  <span>{t('conversation.navigation.back')}</span>
                </button>
                <div className={styles.subtitle} id={`${titleId}-submenu-title`}>
                  {renderedSub.title}
                </div>
              </div>
              <div className={styles.list} role='group' aria-labelledby={`${titleId}-submenu-title`}>
                {renderedSub.options.length === 0 ? (
                  <div className={styles.empty}>{renderedSub.emptyText}</div>
                ) : (
                  renderedSub.options.map((option) => {
                    const showRadio = renderedSub.selectable !== false;
                    return (
                      <button
                        type='button'
                        key={option.key}
                        className={`${styles.item} ${option.disabled ? styles.disabled : ''}`}
                        onClick={() => handleSubSelect(option.key)}
                        disabled={option.disabled}
                        aria-pressed={showRadio ? Boolean(option.active) : undefined}
                        data-testid={`mobile-action-sheet-option-${option.key}`}
                      >
                        <div className={styles.body}>
                          <div className={styles.label}>{option.label}</div>
                          {option.description && <div className={styles.desc}>{option.description}</div>}
                        </div>
                        {showRadio && (
                          <div
                            className={`${styles.radio} ${option.active ? styles.checked : ''}`}
                            aria-hidden='true'
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileActionSheet;
