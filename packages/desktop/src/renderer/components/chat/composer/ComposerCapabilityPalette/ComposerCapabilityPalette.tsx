import { Button, Input, Trigger } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { CheckSmall, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './ComposerCapabilityPalette.module.css';

export type ComposerCapabilityPaletteItem = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: React.ReactNode;
  meta?: string;
  active?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  onSelect: () => void;
};

export type ComposerCapabilityPaletteGroup = {
  id: string;
  label: string;
  items: ComposerCapabilityPaletteItem[];
};

export type ComposerCapabilityPaletteGeometry = {
  width: number;
  horizontalOffset: number;
  verticalOffset: number;
};

/** Aligns the popup to the outer width and top edge of its composer. */
export const calculateComposerCapabilityPaletteGeometry = (
  composerRect: Pick<DOMRect, 'left' | 'top' | 'width'>,
  triggerRect: Pick<DOMRect, 'left' | 'top'>
): ComposerCapabilityPaletteGeometry => ({
  width: composerRect.width,
  horizontalOffset: composerRect.left - triggerRect.left,
  verticalOffset: Math.max(8, triggerRect.top - composerRect.top + 8),
});

type ComposerCapabilityPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: string;
  searchPlaceholder: string;
  noResultsText: string;
  groups: ComposerCapabilityPaletteGroup[];
  position?: 'tl' | 'top' | 'tr';
  horizontalOffset?: number;
  testId?: string;
};

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase();

const ComposerCapabilityPalette: React.FC<ComposerCapabilityPaletteProps> = ({
  open,
  onOpenChange,
  trigger,
  title,
  searchPlaceholder,
  noResultsText,
  groups,
  position = 'tl',
  horizontalOffset = 0,
  testId = 'composer-capability-palette',
}) => {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [geometry, setGeometry] = useState<ComposerCapabilityPaletteGeometry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<RefInputType>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return groups.filter((group) => group.items.length > 0);

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          normalizeSearchText(
            [item.label, item.description, ...(item.keywords ?? [])].filter(Boolean).join(' ')
          ).includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const syncGeometry = useCallback(() => {
    const triggerElement = triggerRef.current;
    const composerElement = triggerElement?.closest<HTMLElement>('[data-composer-palette-boundary="true"]');
    if (!triggerElement || !composerElement) {
      setGeometry(null);
      return;
    }

    const nextGeometry = calculateComposerCapabilityPaletteGeometry(
      composerElement.getBoundingClientRect(),
      triggerElement.getBoundingClientRect()
    );
    if (nextGeometry.width <= 0) return;
    setGeometry((current) =>
      current?.width === nextGeometry.width &&
      current.horizontalOffset === nextGeometry.horizontalOffset &&
      current.verticalOffset === nextGeometry.verticalOffset
        ? current
        : nextGeometry
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    syncGeometry();

    const composerElement = triggerRef.current?.closest<HTMLElement>('[data-composer-palette-boundary="true"]');
    const resizeObserver =
      composerElement && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncGeometry) : null;
    if (composerElement) resizeObserver?.observe(composerElement);
    window.addEventListener('resize', syncGeometry);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncGeometry);
    };
  }, [open, syncGeometry]);

  const focusTrigger = () => {
    requestAnimationFrame(() => triggerRef.current?.querySelector<HTMLElement>('button,[tabindex="0"]')?.focus());
  };

  const closePalette = () => {
    onOpenChange(false);
    focusTrigger();
  };

  const handleVisibleChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen && open) focusTrigger();
  };

  const getEnabledItems = (): HTMLButtonElement[] =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-capability-palette-item]') ?? []).filter(
      (item) => !item.disabled
    );

  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    const items = getEnabledItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex =
        event.key === 'ArrowDown'
          ? currentIndex < 0
            ? 0
            : (currentIndex + 1) % items.length
          : currentIndex < 0
            ? items.length - 1
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const palette = (
    <div
      ref={panelRef}
      className={styles.palette}
      role='dialog'
      aria-modal='false'
      aria-labelledby={titleId}
      data-testid={testId}
      data-capability-palette-width={geometry?.width}
      data-capability-palette-horizontal-offset={geometry?.horizontalOffset ?? horizontalOffset}
      data-capability-palette-vertical-offset={geometry?.verticalOffset ?? 8}
      style={geometry ? { width: geometry.width } : undefined}
      onKeyDown={handlePanelKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <Input
          ref={searchRef}
          className={styles.search}
          value={query}
          onChange={setQuery}
          allowClear
          prefix={<Search theme='outline' size='14' aria-hidden='true' />}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          data-testid={`${testId}-search`}
        />
      </div>
      <div className={styles.content} data-testid={`${testId}-content`} data-capability-palette-scroll-region='true'>
        {filteredGroups.map((group) => (
          <section key={group.id} className={styles.group} aria-labelledby={`${titleId}-${group.id}`}>
            <h3 id={`${titleId}-${group.id}`} className={styles.groupLabel}>
              {group.label}
            </h3>
            <div className={styles.items}>
              {group.items.map((item) => (
                <Button
                  key={item.id}
                  type='text'
                  className={styles.item}
                  disabled={item.disabled}
                  aria-pressed={item.active === undefined ? undefined : item.active}
                  data-capability-palette-item
                  data-testid={`${testId}-item-${item.id}`}
                  onClick={() => {
                    item.onSelect();
                    if (item.closeOnSelect !== false) closePalette();
                  }}
                >
                  <span className={styles.itemIcon} aria-hidden='true' data-capability-palette-icon>
                    {item.icon}
                  </span>
                  <span className={styles.itemCopy}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.description ? <span className={styles.itemDescription}>{item.description}</span> : null}
                  </span>
                  {item.active ? (
                    <CheckSmall theme='outline' size='16' className={styles.itemMeta} aria-hidden='true' />
                  ) : item.meta ? (
                    <span className={styles.itemMeta}>{item.meta}</span>
                  ) : null}
                </Button>
              ))}
            </div>
          </section>
        ))}
        {filteredGroups.length === 0 ? <div className={styles.empty}>{noResultsText}</div> : null}
      </div>
    </div>
  );

  return (
    <Trigger
      popup={() => palette}
      trigger='click'
      position={position}
      popupVisible={open}
      onVisibleChange={handleVisibleChange}
      clickToClose
      popupAlign={{
        top: [geometry?.horizontalOffset ?? horizontalOffset, geometry?.verticalOffset ?? 8],
      }}
    >
      <span ref={triggerRef} className={styles.trigger}>
        {trigger}
      </span>
    </Trigger>
  );
};

export default ComposerCapabilityPalette;
