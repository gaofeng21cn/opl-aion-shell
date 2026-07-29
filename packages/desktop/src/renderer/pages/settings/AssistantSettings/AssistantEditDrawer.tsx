/**
 * AssistantEditDrawer — Drawer for creating/editing an assistant.
 * Contains name/avatar fields, agent selector, rules editor, and skills section.
 */
import type { AssistantListItem, SkillInfo } from './types';
import type { ManagedAgentBackendOption } from '@/renderer/hooks/agent/useManagedAgents';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { Avatar, Button, Checkbox, Collapse, Drawer, Input, Select, Tag, Typography } from '@arco-design/web-react';
import { Close, Delete, Info, Plus, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type AssistantEditDrawerProps = {
  // Drawer visibility
  editVisible: boolean;
  setEditVisible: (v: boolean) => void;
  isCreating: boolean;

  // Identity fields
  editName: string;
  setEditName: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editAvatar: string;
  setEditAvatar: (v: string) => void;
  editAvatarImage: string | undefined;
  editAgent: string;
  setEditAgent: (v: string) => void;

  // Rules / prompt
  editContext: string;
  setEditContext: (v: string) => void;
  promptViewMode: 'edit' | 'preview';
  setPromptViewMode: (v: 'edit' | 'preview') => void;

  // Skills state
  availableSkills: SkillInfo[];
  selectedSkills: string[];
  setSelectedSkills: (v: string[]) => void;
  pendingSkills: Array<{ name: string; description: string }>;
  customSkills: string[];
  setDeletePendingSkillName: (v: string | null) => void;
  setDeleteCustomSkillName: (v: string | null) => void;

  // Active assistant info
  activeAssistant: AssistantListItem | null;
  activeAssistantId: string | null;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;

  // Agent backend options
  availableBackends: ManagedAgentBackendOption[];

  // Handlers
  handleSave: () => void;
  handleDeleteClick: () => void;
  /** Duplicate the active assistant. Used by the builtin readonly banner so
   *  users can create an editable copy from inside the editor. */
  handleDuplicate: (assistant: AssistantListItem) => void;
};

const AssistantEditDrawer: React.FC<AssistantEditDrawerProps> = ({
  editVisible,
  setEditVisible,
  isCreating,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editAvatar,
  setEditAvatar,
  editAvatarImage,
  editAgent,
  setEditAgent,
  editContext,
  setEditContext,
  promptViewMode,
  setPromptViewMode,
  availableSkills,
  selectedSkills,
  setSelectedSkills,
  pendingSkills,
  customSkills: _customSkills,
  setDeletePendingSkillName,
  setDeleteCustomSkillName,
  activeAssistant,
  activeAssistantId: _activeAssistantId,
  isExtensionAssistant,
  availableBackends,
  handleSave,
  handleDeleteClick,
  handleDuplicate,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const [drawerWidth, setDrawerWidth] = useState(500);
  const [rulesExpanded, setRulesExpanded] = useState(false);

  // Auto focus textarea when drawer opens in edit mode
  useEffect(() => {
    if (editVisible && promptViewMode === 'edit') {
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editVisible, promptViewMode]);

  // Responsive drawer width
  useEffect(() => {
    const updateDrawerWidth = () => {
      if (typeof window === 'undefined') return;
      const nextWidth = Math.min(1024, Math.max(480, Math.floor(window.innerWidth * 0.5)));
      setDrawerWidth(nextWidth);
    };

    updateDrawerWidth();
    window.addEventListener('resize', updateDrawerWidth);
    return () => window.removeEventListener('resize', updateDrawerWidth);
  }, []);

  // Whether skills section should be visible.
  // All non-extension assistants expose a skills panel: user/custom can edit,
  // builtins show a read-only toggle list. The backend has already filtered
  // extension assistants into their own source class.
  const showSkills = isCreating || (activeAssistant !== null && activeAssistant.source !== 'extension');

  const agentOptions = availableBackends;
  const selectedAgentOption = agentOptions.find((option) => option.id === editAgent);

  const customSkillItems = availableSkills.filter((skill) => skill.source === 'custom');
  const builtinSkillItems = availableSkills.filter((skill) => skill.source === 'builtin');
  const extensionSkillItems = availableSkills.filter((skill) => skill.source === 'extension');
  const customActiveCount = selectedSkills.filter(
    (name) =>
      pendingSkills.some((skill) => skill.name === name) || customSkillItems.some((skill) => skill.name === name)
  ).length;
  const builtinActiveCount = selectedSkills.filter((name) =>
    builtinSkillItems.some((skill) => skill.name === name)
  ).length;
  const extensionActiveCount = selectedSkills.filter((name) =>
    extensionSkillItems.some((skill) => skill.name === name)
  ).length;
  const customStatusDotColor = customActiveCount > 0 ? 'rgb(var(--success-6))' : 'var(--color-text-4)';
  const builtinStatusDotColor = builtinActiveCount > 0 ? 'rgb(var(--success-6))' : 'var(--color-text-4)';
  const extensionStatusDotColor = extensionActiveCount > 0 ? 'rgb(var(--success-6))' : 'var(--color-text-4)';
  const totalSkillsCount =
    pendingSkills.length + customSkillItems.length + builtinSkillItems.length + extensionSkillItems.length;
  const totalActiveSkillsCount = selectedSkills.filter(
    (name) => pendingSkills.some((skill) => skill.name === name) || availableSkills.some((skill) => skill.name === name)
  ).length;
  const isBuiltin = activeAssistant?.source === 'builtin';
  const isRuleEditable = !isBuiltin;
  const isSkillsEditable = isCreating || !isBuiltin;
  const rulesContainerHeight = rulesExpanded
    ? '420px'
    : isRuleEditable && promptViewMode === 'edit'
      ? '260px'
      : '220px';
  const renderAgentOption = (option: ManagedAgentBackendOption) => {
    const logo = resolveAgentLogo({
      backend: option.runtimeKey,
      isExtension: option.isExtension,
    });
    return (
      <span className='flex items-center gap-8px min-w-0'>
        <Avatar
          size={20}
          shape='square'
          className='shrink-0'
          style={{ backgroundColor: logo ? 'transparent' : 'var(--color-fill-2)' }}
        >
          {logo ? (
            <img src={logo} alt='' className='h-full w-full object-contain' />
          ) : (
            <Robot theme='outline' size={14} fill='currentColor' />
          )}
        </Avatar>
        <span className='truncate'>{option.name}</span>
        {option.isExtension && (
          <Tag size='small' color='arcoblue'>
            ext
          </Tag>
        )}
      </span>
    );
  };

  return (
    <Drawer
      title={
        <>
          <span>
            {isCreating
              ? t('settings.createAssistant', { defaultValue: 'Create Assistant' })
              : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
          </span>
          <button
            type='button'
            aria-label={t('common.close', { defaultValue: 'Close' })}
            onClick={(e) => {
              e.stopPropagation();
              setEditVisible(false);
            }}
            className='absolute right-4 top-2 cursor-pointer border-0 bg-transparent text-t-secondary hover:text-t-primary transition-colors p-1'
            style={{ zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Close theme='outline' size={18} fill='currentColor' />
          </button>
        </>
      }
      closable={false}
      visible={editVisible}
      placement='right'
      width={drawerWidth}
      zIndex={1200}
      getPopupContainer={() => document.body}
      autoFocus={false}
      onCancel={() => {
        setEditVisible(false);
      }}
      headerStyle={{ background: 'var(--color-bg-1)' }}
      bodyStyle={{ background: 'var(--color-bg-1)' }}
      footer={
        <div className='flex items-center justify-between w-full'>
          <div className='flex items-center gap-8px'>
            <Button
              type='primary'
              onClick={handleSave}
              data-testid='btn-save-assistant'
              className='w-[100px] rounded-[100px]'
            >
              {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button
              onClick={() => {
                setEditVisible(false);
              }}
              className='w-[100px] rounded-[100px] bg-fill-2'
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
          {!isCreating && activeAssistant?.source !== 'builtin' && !isExtensionAssistant(activeAssistant) && (
            <Button
              status='danger'
              onClick={handleDeleteClick}
              data-testid='btn-delete-assistant'
              className='rounded-[100px]'
              style={{ backgroundColor: 'rgb(var(--danger-1))' }}
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
          )}
        </div>
      }
    >
      <div className='flex flex-col h-full overflow-hidden' data-testid='assistant-edit-drawer'>
        <div
          className='flex flex-col flex-1 gap-20px bg-transparent overflow-y-auto pr-4px'
          data-testid='assistant-edit-flat-content'
        >
          {/* Builtin readonly banner — only Main Agent is editable on builtin
              assistants. The inline link drives the user to duplicate so they
              can edit the copy. */}
          {isBuiltin && activeAssistant && (
            <div
              className='flex items-start gap-8px border-0 border-t border-solid border-line py-12px'
              data-testid='assistant-builtin-readonly-banner'
            >
              <Info theme='outline' size={16} fill='currentColor' className='mt-2px flex-shrink-0 text-t-secondary' />
              <div className='text-13px leading-20px text-t-primary'>
                <span>
                  {t('settings.assistantBuiltinReadonlyTip', {
                    defaultValue:
                      'This is a builtin assistant. Only Main Agent can be changed. To customize other fields, ',
                  })}
                </span>
                <a
                  className='text-primary-6 hover:text-primary-7 underline-offset-2 hover:underline cursor-pointer'
                  onClick={(e) => {
                    e.preventDefault();
                    handleDuplicate(activeAssistant);
                  }}
                  data-testid='link-duplicate-from-banner'
                >
                  {t('settings.assistantBuiltinReadonlyDuplicateLink', { defaultValue: 'duplicate it' })}
                </a>
                <span>{t('settings.assistantBuiltinReadonlyTipSuffix', { defaultValue: '.' })}</span>
              </div>
            </div>
          )}

          {/* Name & Avatar */}
          <div className='flex-shrink-0'>
            <Typography.Text bold>
              <span className='text-red-500'>*</span>{' '}
              {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
            </Typography.Text>
            <div className='mt-10px flex items-center gap-12px'>
              {activeAssistant?.source === 'builtin' ? (
                <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px'>
                  {editAvatarImage ? (
                    <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                  ) : editAvatar ? (
                    <span className='text-24px'>{editAvatar}</span>
                  ) : (
                    <Robot theme='outline' size={20} fill='currentColor' />
                  )}
                </Avatar>
              ) : (
                <EmojiPicker value={editAvatar} onChange={(emoji) => setEditAvatar(emoji)} placement='br'>
                  <div className='cursor-pointer'>
                    <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px hover:bg-fill-2 transition-colors'>
                      {editAvatarImage ? (
                        <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                      ) : editAvatar ? (
                        <span className='text-24px'>{editAvatar}</span>
                      ) : (
                        <Robot theme='outline' size={20} fill='currentColor' />
                      )}
                    </Avatar>
                  </div>
                </EmojiPicker>
              )}
              <Input
                value={editName}
                onChange={(value) => setEditName(value)}
                disabled={activeAssistant?.source === 'builtin'}
                placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })}
                data-testid='input-assistant-name'
                className='flex-1 rounded-4px bg-bg-1'
              />
            </div>
          </div>

          {/* Description */}
          <div className='flex-shrink-0'>
            <Typography.Text bold>
              {t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}
            </Typography.Text>
            <Input
              className='mt-10px rounded-4px bg-bg-1'
              value={editDescription}
              onChange={(value) => setEditDescription(value)}
              disabled={activeAssistant?.source === 'builtin'}
              data-testid='input-assistant-desc'
              placeholder={t('settings.assistantDescriptionPlaceholder', {
                defaultValue: 'What can this assistant help with?',
              })}
            />
          </div>

          {/* Main Agent selector */}
          <div className='flex-shrink-0'>
            <Typography.Text bold>
              <span className='inline-flex items-center gap-6px'>
                <Robot theme='outline' size={14} fill='currentColor' />
                {t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}
              </span>
            </Typography.Text>
            <Select
              className='mt-10px w-full rounded-4px'
              value={editAgent}
              onChange={(value) => setEditAgent(value as string)}
              data-testid='select-assistant-agent'
            >
              {agentOptions.map((opt) => (
                <Select.Option key={opt.id} value={opt.id}>
                  {renderAgentOption(opt)}
                </Select.Option>
              ))}
            </Select>
          </div>

          {/* Summary */}
          <div
            className='flex flex-wrap items-center gap-x-8px gap-y-4px border-0 border-t border-solid border-line py-12px'
            data-testid='assistant-summary-row'
          >
            <span className='text-12px text-t-secondary'>
              {t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}:
            </span>
            <span className='text-12px font-500 text-t-primary'>
              {selectedAgentOption?.name || selectedAgentOption?.runtimeKey || editAgent}
            </span>
            <span className='text-12px text-t-secondary ml-6px'>
              {t('settings.assistantSkills', { defaultValue: 'Skills' })}:
            </span>
            <span className='text-12px font-500 text-t-primary'>
              {totalActiveSkillsCount > 0 ? `${totalActiveSkillsCount}/${totalSkillsCount}` : totalSkillsCount}
            </span>
          </div>

          {/* Rules / Prompt */}
          <div className='flex-shrink-0'>
            <div className='flex items-center justify-between'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantRules', { defaultValue: 'Rules' })}
              </Typography.Text>
              <Button
                type='text'
                size='mini'
                data-testid='btn-expand-rules'
                onClick={() => setRulesExpanded((prev) => !prev)}
              >
                {rulesExpanded
                  ? t('common.collapse', { defaultValue: 'Collapse' })
                  : t('common.expand', { defaultValue: 'Expand' })}
              </Button>
            </div>
            <div
              className='mt-10px border border-border-2 overflow-hidden rounded-4px'
              style={{ height: rulesContainerHeight }}
            >
              {isRuleEditable && (
                <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                  <div
                    className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                    onClick={() => setPromptViewMode('edit')}
                  >
                    {t('settings.promptEdit', { defaultValue: 'Edit' })}
                  </div>
                  <div
                    className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                    onClick={() => setPromptViewMode('preview')}
                  >
                    {t('settings.promptPreview', { defaultValue: 'Preview' })}
                  </div>
                </div>
              )}
              <div
                className='bg-fill-2'
                style={{
                  height: isRuleEditable ? 'calc(100% - 36px)' : '100%',
                  overflow: 'auto',
                }}
              >
                {promptViewMode === 'edit' && isRuleEditable ? (
                  <div ref={textareaWrapperRef} className='h-full'>
                    <Input.TextArea
                      value={editContext}
                      onChange={(value) => setEditContext(value)}
                      placeholder={t('settings.assistantRulesPlaceholder', {
                        defaultValue: 'Enter rules in Markdown format...',
                      })}
                      autoSize={false}
                      className='border-none rounded-none bg-transparent h-full resize-none'
                    />
                  </div>
                ) : (
                  <div className='p-16px text-14px leading-7'>
                    {editContext ? (
                      <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView>
                    ) : (
                      <div className='text-t-secondary text-center py-32px'>
                        {t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Skills section */}
          {showSkills && (
            <div className='flex-shrink-0 mt-16px' data-testid='skills-section'>
              <div className='flex items-center justify-between mb-12px'>
                <Typography.Text bold>{t('settings.assistantSkills', { defaultValue: 'Skills' })}</Typography.Text>
                {/* Builtin readonly assistants don't expose an Add Skills entry
                    point — users must duplicate first. The skill checkbox list
                    below renders disabled for the same reason. */}
                {isSkillsEditable && (
                  <Button
                    size='small'
                    type='outline'
                    icon={<Plus theme='outline' size={14} fill='currentColor' />}
                    onClick={() => navigate('/settings/capabilities?tab=skills')}
                    className='rounded-[100px]'
                    data-testid='btn-add-skills'
                  >
                    {t('settings.addSkills', { defaultValue: 'Add Skills' })}
                  </Button>
                )}
              </div>

              <Collapse defaultActiveKey={['custom-skills']} data-testid='skills-collapse'>
                {/* Custom Skills (Pending + Imported) */}
                <Collapse.Item
                  header={
                    <span className='text-13px font-medium'>
                      {t('settings.customSkills', { defaultValue: 'Imported Skills (Library)' })}
                    </span>
                  }
                  name='custom-skills'
                  className='mb-8px'
                  extra={
                    <div className='flex items-center gap-8px'>
                      <span
                        className='inline-block w-8px h-8px rd-50%'
                        style={{ background: customStatusDotColor }}
                        aria-hidden='true'
                      />
                      <span className='text-12px text-t-secondary'>
                        {customActiveCount > 0
                          ? `${customActiveCount}/${pendingSkills.length + customSkillItems.length}`
                          : pendingSkills.length + customSkillItems.length}
                      </span>
                    </div>
                  }
                >
                  <div className='space-y-4px'>
                    {/* Pending skills (not yet imported) */}
                    {pendingSkills.map((skill) => (
                      <div
                        key={`pending-${skill.name}`}
                        className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                      >
                        <Checkbox
                          checked={selectedSkills.includes(skill.name)}
                          disabled={!isSkillsEditable}
                          className='mt-2px cursor-pointer'
                          onChange={() => {
                            if (selectedSkills.includes(skill.name)) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                            } else {
                              setSelectedSkills([...selectedSkills, skill.name]);
                            }
                          }}
                        />
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center gap-6px'>
                            <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                            <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 border border-[rgba(var(--primary-6),0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                              Pending
                            </span>
                          </div>
                          {skill.description && (
                            <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                          )}
                        </div>
                        <button
                          className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletePendingSkillName(skill.name);
                          }}
                          title={t('settings.removeFromAssistant', { defaultValue: 'Remove from assistant' })}
                        >
                          <Delete theme='outline' size={16} fill='currentColor' className='text-t-tertiary' />
                        </button>
                      </div>
                    ))}
                    {/* All imported custom skills */}
                    {customSkillItems.map((skill) => (
                      <div
                        key={`custom-${skill.name}`}
                        className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                      >
                        <Checkbox
                          checked={selectedSkills.includes(skill.name)}
                          disabled={!isSkillsEditable}
                          className='mt-2px cursor-pointer'
                          onChange={() => {
                            if (selectedSkills.includes(skill.name)) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                            } else {
                              setSelectedSkills([...selectedSkills, skill.name]);
                            }
                          }}
                        />
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center gap-6px'>
                            <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                            <span className='bg-[rgba(242,156,27,0.08)] text-[rgb(242,156,27)] border border-[rgba(242,156,27,0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                              {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                            </span>
                          </div>
                          {skill.description && (
                            <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                          )}
                        </div>
                        <button
                          className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteCustomSkillName(skill.name);
                          }}
                          title={t('settings.removeFromAssistant', { defaultValue: 'Remove from assistant' })}
                        >
                          <Delete theme='outline' size={16} fill='currentColor' className='text-t-tertiary' />
                        </button>
                      </div>
                    ))}
                    {pendingSkills.length === 0 && customSkillItems.length === 0 && (
                      <div className='text-center text-t-secondary text-12px py-16px'>
                        {t('settings.noCustomSkills', { defaultValue: 'No custom skills added' })}
                      </div>
                    )}
                  </div>
                </Collapse.Item>

                {/* Builtin Skills */}
                <Collapse.Item
                  header={
                    <span className='text-13px font-medium'>
                      {t('settings.builtinSkills', { defaultValue: 'Builtin Skills' })}
                    </span>
                  }
                  name='builtin-skills'
                  extra={
                    <div className='flex items-center gap-8px'>
                      <span
                        className='inline-block w-8px h-8px rd-50%'
                        style={{ background: builtinStatusDotColor }}
                        aria-hidden='true'
                      />
                      <span className='text-12px text-t-secondary'>
                        {builtinActiveCount > 0
                          ? `${builtinActiveCount}/${builtinSkillItems.length}`
                          : builtinSkillItems.length}
                      </span>
                    </div>
                  }
                >
                  {builtinSkillItems.length > 0 ? (
                    <div className='space-y-4px'>
                      {builtinSkillItems.map((skill) => (
                        <div key={skill.name} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'>
                          <Checkbox
                            checked={selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (selectedSkills.includes(skill.name)) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                            {skill.description && (
                              <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='text-center text-t-secondary text-12px py-16px'>
                      {t('settings.noBuiltinSkills', { defaultValue: 'No builtin skills available' })}
                    </div>
                  )}
                </Collapse.Item>

                {/* Extension Skills */}
                {extensionSkillItems.length > 0 && (
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.extensionSkills', { defaultValue: 'Extension Skills' })}
                      </span>
                    }
                    name='extension-skills'
                    extra={
                      <div className='flex items-center gap-8px'>
                        <span
                          className='inline-block w-8px h-8px rd-50%'
                          style={{ background: extensionStatusDotColor }}
                          aria-hidden='true'
                        />
                        <span className='text-12px text-t-secondary'>
                          {extensionActiveCount > 0
                            ? `${extensionActiveCount}/${extensionSkillItems.length}`
                            : extensionSkillItems.length}
                        </span>
                      </div>
                    }
                  >
                    <div className='space-y-4px'>
                      {extensionSkillItems.map((skill) => (
                        <div key={skill.name} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'>
                          <Checkbox
                            checked={selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (selectedSkills.includes(skill.name)) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-6px'>
                              <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                              <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 border border-[rgba(var(--primary-6),0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                                {t('settings.extensionSkillsBadge', { defaultValue: 'Extension' })}
                              </span>
                            </div>
                            {skill.description && (
                              <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Collapse.Item>
                )}
              </Collapse>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default AssistantEditDrawer;
