/**
 * AssistantListPanel — Renders the collapsible list of assistants
 * with avatar, name, enabled switch, and edit/duplicate actions.
 */
import { filterAssistants, groupAssistantsByEnabled, type AssistantListFilter } from './assistantUtils';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AssistantListItem } from './types';
import AssistantAvatar from './AssistantAvatar';
import { Button, Input, Switch, Tabs, Tag, Tooltip } from '@arco-design/web-react';
import { CloseSmall, Copy, Plus, Search, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AssistantListPanelProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  avatarImageMap: Record<string, string>;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;
  onEdit: (assistant: AssistantListItem) => void;
  onDuplicate: (assistant: AssistantListItem) => void;
  onCreate: () => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  setActiveAssistantId: (id: string) => void;
  /** When set, scroll to and highlight the matching assistant card */
  highlightId?: string | null;
  /** Called after the highlight animation completes so the parent can clear the param */
  onHighlightConsumed?: () => void;
};

const AssistantListPanel: React.FC<AssistantListPanelProps> = ({
  assistants,
  localeKey,
  avatarImageMap,
  isExtensionAssistant,
  onEdit,
  onDuplicate,
  onCreate,
  onToggleEnabled,
  setActiveAssistantId,
  highlightId,
  onHighlightConsumed,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [search_query, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<AssistantListFilter>('all');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRefSetter = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      cardRefs.current[id] = el;
    },
    []
  );

  // Scroll to and highlight an assistant card when navigated with ?highlight=id
  // Depends on `assistants` so it re-runs after async data loads and refs are populated.
  // Uses a short delay to ensure the page layout is fully settled on first mount.
  useEffect(() => {
    if (!highlightId || assistants.length === 0) return;
    const el = cardRefs.current[highlightId];
    if (!el) return;

    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(highlightId);
      setTimeout(() => {
        setHighlightedId(null);
        onHighlightConsumed?.();
      }, 2000);
    }, 150);

    return () => clearTimeout(timer);
  }, [highlightId, assistants, onHighlightConsumed]);

  const filteredAssistants = useMemo(
    () => filterAssistants(assistants, search_query, activeFilter, localeKey),
    [activeFilter, assistants, localeKey, search_query]
  );
  const { enabledAssistants, disabledAssistants } = useMemo(
    () => groupAssistantsByEnabled(filteredAssistants),
    [filteredAssistants]
  );

  const filterOptions: Array<{ key: AssistantListFilter; label: string }> = [
    { key: 'all', label: t('settings.assistantFilterAll', { defaultValue: 'All' }) },
    { key: 'builtin', label: t('settings.assistantFilterBuiltin', { defaultValue: 'System' }) },
    { key: 'user', label: t('settings.assistantFilterCustom', { defaultValue: 'Custom' }) },
  ];

  const renderSourceTag = (assistant: AssistantListItem) => {
    if (assistant.source === 'builtin' || assistant.source === 'extension') {
      return null;
    }

    return (
      <Tag
        size='small'
        color='gray'
        bordered={false}
        className='!rounded-4px !px-6px !py-0 !text-11px !leading-16px !text-t-secondary'
      >
        {t('settings.assistantSourceCustom', { defaultValue: 'Custom' })}
      </Tag>
    );
  };

  const renderAssistantCard = (assistant: AssistantListItem) => {
    const assistantIsExtension = isExtensionAssistant(assistant);
    const duplicateLabel = t('settings.duplicateAssistant', { defaultValue: 'Duplicate' });

    return (
      <div
        key={assistant.id}
        ref={cardRefSetter(assistant.id)}
        data-testid={`assistant-card-${assistant.id}`}
        className={`group flex cursor-pointer items-center justify-between border-0 border-t border-solid border-border-1 px-2px py-12px transition-colors duration-150 hover:bg-fill-1 ${highlightedId === assistant.id ? 'bg-fill-2' : 'bg-transparent'}`}
        onClick={() => {
          setActiveAssistantId(assistant.id);
          onEdit(assistant);
        }}
      >
        <div className='flex items-center gap-12px min-w-0 flex-1'>
          <AssistantAvatar assistant={assistant} size={28} avatarImageMap={avatarImageMap} />
          <div className='min-w-0 flex-1'>
            <div className='font-medium text-t-primary min-w-0 flex items-center gap-10px'>
              <span className='truncate'>{assistant.name_i18n?.[localeKey] || assistant.name}</span>
              <div className='flex items-center gap-6px flex-shrink-0'>{renderSourceTag(assistant)}</div>
            </div>
            <div className='text-12px text-t-secondary truncate'>
              {assistant.description_i18n?.[localeKey] || assistant.description || ''}
            </div>
          </div>
        </div>
        <div
          className='flex items-center gap-10px text-t-secondary ml-12px flex-shrink-0'
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip content={duplicateLabel}>
            <Button
              type='text'
              size='small'
              icon={<Copy theme='outline' size={16} />}
              aria-label={duplicateLabel}
              className='!h-32px !w-32px !rounded-6px !p-0'
              data-testid={`btn-duplicate-${assistant.id}`}
              onClick={() => {
                onDuplicate(assistant);
              }}
            />
          </Tooltip>
          <Switch
            size='small'
            data-testid={`switch-enabled-${assistant.id}`}
            checked={assistantIsExtension ? true : assistant.enabled !== false}
            disabled={assistantIsExtension}
            onChange={(checked) => {
              onToggleEnabled(assistant, checked);
            }}
          />
          <Button
            type='text'
            size='small'
            icon={<SettingOne size={16} />}
            className='!rounded-6px'
            data-testid={`btn-edit-${assistant.id}`}
            onClick={() => {
              onEdit(assistant);
            }}
          />
        </div>
      </div>
    );
  };

  const renderSection = (title: string, sectionAssistants: AssistantListItem[]) => {
    if (sectionAssistants.length === 0) return null;

    return (
      <div className='space-y-6px'>
        <div className='flex items-center gap-6px px-2px text-12px font-medium text-t-secondary'>
          {title}
          <span className='text-t-tertiary'>({sectionAssistants.length})</span>
        </div>
        <div>{sectionAssistants.map(renderAssistantCard)}</div>
      </div>
    );
  };

  const isSearchVisible = searchExpanded || search_query.length > 0;

  return (
    <div className='min-w-0 py-2px'>
      <div className='min-w-0'>
        <div className='mb-16px flex flex-col gap-12px'>
          <div className={`flex gap-12px ${isMobile ? 'flex-col' : 'items-start justify-between'}`}>
            <div className='min-w-0'>
              <h2 className='m-0 text-16px font-600 leading-24px text-t-primary'>
                {t('settings.assistants', { defaultValue: 'Assistants' })}
              </h2>
            </div>
            <div className={`${isMobile ? 'w-full' : 'flex-shrink-0'}`}>
              <Button
                type='secondary'
                size='small'
                className={isMobile ? '!h-34px !w-full' : '!h-32px !px-12px'}
                icon={<Plus size={14} fill='currentColor' />}
                onClick={onCreate}
                data-testid='btn-create-assistant'
              >
                {t('settings.createAssistant', { defaultValue: 'Create Assistant' })}
              </Button>
            </div>
          </div>
          <div className={`flex gap-12px ${isMobile ? 'flex-col' : 'items-end justify-between'}`}>
            <div className='min-w-0 max-w-[760px] space-y-6px'>
              <p className='m-0 text-14px text-t-secondary leading-relaxed'>
                {t('settings.assistantsListDescription', {
                  defaultValue: 'Build task-specific assistants by combining an AI agent with custom rules and skills.',
                })}
              </p>
            </div>
            <div
              className={`flex ${isMobile ? 'items-center justify-between' : 'items-center'} gap-10px text-12px text-t-tertiary`}
            >
              <Button
                type={isSearchVisible ? 'secondary' : 'text'}
                size='small'
                data-testid='btn-search-toggle'
                className='!h-34px !w-34px !rounded-6px !p-0 flex items-center justify-center !text-t-secondary hover:!bg-fill-1 hover:!text-t-primary'
                icon={
                  isSearchVisible ? (
                    <CloseSmall size={16} fill='currentColor' />
                  ) : (
                    <Search size={16} fill='currentColor' />
                  )
                }
                onClick={() => {
                  if (isSearchVisible) {
                    setSearchExpanded(false);
                    setSearchQuery('');
                    return;
                  }
                  setSearchExpanded(true);
                }}
              />
            </div>
          </div>
          {isSearchVisible && (
            <Input
              allowClear
              autoFocus
              value={search_query}
              onChange={setSearchQuery}
              data-testid='input-search-assistant'
              className='!bg-transparent'
              placeholder={t('settings.searchAssistants', {
                defaultValue: 'Search assistants by name or description',
              })}
              prefix={<Search size={14} fill='currentColor' />}
            />
          )}
          <Tabs
            activeTab={activeFilter}
            onChange={(key) => setActiveFilter((key as AssistantListFilter) || 'all')}
            type='line'
            className='assistant-filter-tabs w-full'
          >
            {filterOptions.map((filterOption) => (
              <Tabs.TabPane key={filterOption.key} title={filterOption.label} />
            ))}
          </Tabs>
        </div>

        {filteredAssistants.length > 0 ? (
          <div className='space-y-14px'>
            {renderSection(t('settings.assistantSectionEnabled', { defaultValue: 'Enabled' }), enabledAssistants)}
            {renderSection(t('settings.assistantSectionDisabled', { defaultValue: 'Disabled' }), disabledAssistants)}
          </div>
        ) : (
          <div className='text-center text-t-secondary py-12px'>
            {t('settings.assistantNoMatch', {
              defaultValue: 'No assistants match the current filters.',
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantListPanel;
