import { ipcBridge } from '@/common';
import { getOplDefaultPackagedCodexSkills, getOplPackagedCodexSkills } from '@/common/config/oplProductProfile';
import { Button, Input, Message, Modal, Typography } from '@arco-design/web-react';
import { Delete, FolderOpen, Lightning, Puzzle, Refresh, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import type { ManagedDependency } from '@/renderer/services/managedUpdateProjection';
import { localizedCapabilitySummary } from '@/renderer/utils/ui/capabilitySummary';

// Skill 信息类型 / Skill info type
interface SkillInfo {
  name: string;
  description: string;
  location: string;
  /**
   * Relative location under the builtin-skills corpus (e.g.
   * `auto-inject/cron/SKILL.md`). Present only for `source=builtin`; the
   * export-to-external-source flow still uses absolute `location` paths.
   */
  relative_location?: string;
  is_custom: boolean;
  source?: 'builtin' | 'custom' | 'extension';
}

// Normalize skill name for data-testid usage
const normalizeTestId = (name: string): string => {
  return name.replace(/[:/\s<>"'|?*]/g, '-');
};

interface SkillsHubSettingsProps {
  /** When false, renders without SettingsPageWrapper — useful for embedding in a tab */
  withWrapper?: boolean;
  flowManagedSkillIds?: string[];
  flowManagedSkillDependencies?: ManagedDependency[];
  flowManagedCliDependencies?: ManagedDependency[];
  flowSyncing?: boolean;
  onSyncFlow?: () => void;
  displayGroup?: 'all' | 'flow' | 'manual';
}

type FlowCapabilityDetailsProps = {
  id: string;
  description?: string;
  source: string;
  version?: string;
  t: (key: string, options?: Record<string, string>) => string;
};

const FlowCapabilityDetails: React.FC<FlowCapabilityDetailsProps> = ({ id, description, source, version, t }) => (
  <details
    className='mt-5px text-12px text-t-secondary'
    data-testid={`opl-flow-capability-details-${normalizeTestId(id)}`}
  >
    <summary className='w-fit cursor-pointer font-500'>
      {t('settings.uiOptimization.capabilities.actions.viewDetails')}
    </summary>
    <div className='mt-6px grid min-w-0 grid-cols-1 gap-4px'>
      {description && (
        <div className='min-w-0 break-words'>
          <Typography.Text className='text-t-tertiary'>
            {t('settings.uiOptimization.capabilities.details.originalDescription')}:{' '}
          </Typography.Text>
          <Typography.Text className='text-t-secondary'>{description}</Typography.Text>
        </div>
      )}
      <div className='min-w-0 break-words'>
        <Typography.Text className='text-t-tertiary'>
          {t('settings.uiOptimization.capabilities.details.source')}:{' '}
        </Typography.Text>
        <Typography.Text className='text-t-secondary'>{source}</Typography.Text>
      </div>
      <div className='min-w-0 break-words'>
        <Typography.Text className='text-t-tertiary'>
          {t('settings.uiOptimization.capabilities.details.version')}:{' '}
        </Typography.Text>
        <Typography.Text className='text-t-secondary'>
          {version ?? t('settings.capabilitiesPage.detailValues.notReported')}
        </Typography.Text>
      </div>
    </div>
  </details>
);

const SkillsHubSettings: React.FC<SkillsHubSettingsProps> = ({
  withWrapper = true,
  flowManagedSkillIds,
  flowManagedSkillDependencies = [],
  flowManagedCliDependencies = [],
  flowSyncing = false,
  onSyncFlow,
  displayGroup = 'all',
}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightName = searchParams.get('highlight');
  const [highlightedSkill, setHighlightedSkill] = useState<string | null>(null);
  const skillRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [skillPaths, setSkillPaths] = useState<{ user_skills_dir: string; builtin_skills_dir: string } | null>(null);
  const [search_query, setSearchQuery] = useState('');
  const [builtinAutoSkills, setBuiltinAutoSkills] = useState<Array<{ name: string; description: string }>>([]);

  const allUserSkills = useMemo(() => availableSkills.filter((s) => s.source !== 'extension'), [availableSkills]);
  const extensionSkills = useMemo(() => availableSkills.filter((s) => s.source === 'extension'), [availableSkills]);
  const flowManagedIdSet = useMemo(() => new Set(flowManagedSkillIds ?? []), [flowManagedSkillIds]);
  const flowManagedSkillDependencyById = useMemo(
    () => new Map(flowManagedSkillDependencies.map((dependency) => [dependency.id, dependency])),
    [flowManagedSkillDependencies]
  );
  const flowManagedCliIdSet = useMemo(
    () => new Set(flowManagedCliDependencies.map((dependency) => dependency.id)),
    [flowManagedCliDependencies]
  );
  const flowManagedSkills = useMemo(
    () => allUserSkills.filter((skill) => flowManagedIdSet.has(skill.name)),
    [allUserSkills, flowManagedIdSet]
  );
  const missingFlowManagedSkillIds = useMemo(() => {
    const installed = new Set(flowManagedSkills.map((skill) => skill.name));
    return [...flowManagedIdSet].filter((id) => !installed.has(id) && !flowManagedCliIdSet.has(id));
  }, [flowManagedCliIdSet, flowManagedIdSet, flowManagedSkills]);
  const mySkills = useMemo(
    () =>
      flowManagedSkillIds === undefined
        ? allUserSkills
        : allUserSkills.filter((skill) => !flowManagedIdSet.has(skill.name)),
    [allUserSkills, flowManagedIdSet, flowManagedSkillIds]
  );
  const flowManagedSkillIsInstalled = (skillId: string, locallyAvailable: boolean): boolean => {
    const dependency = flowManagedSkillDependencyById.get(skillId);
    return dependency ? dependency.installed && dependency.currentness !== 'missing' : locallyAvailable;
  };

  const filteredSkills = useMemo(() => {
    if (!search_query.trim()) return mySkills;
    const lowerQuery = search_query.toLowerCase();
    return mySkills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [mySkills, search_query]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const appVisibleSkills = new Set(getOplPackagedCodexSkills());
      const skills = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skills.filter((skill) => skill.source !== 'builtin' || appVisibleSkills.has(skill.name)));

      const paths = await ipcBridge.fs.getSkillPaths.invoke();
      setSkillPaths(paths);

      const autoSkills = await ipcBridge.fs.listBuiltinAutoSkills.invoke();
      const appPackagedSkills = new Set(getOplDefaultPackagedCodexSkills());
      setBuiltinAutoSkills(autoSkills.filter((skill) => appPackagedSkills.has(skill.name)));
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      Message.error(t('settings.skillsHub.fetchError', { defaultValue: 'Failed to fetch skills' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Scroll to and highlight a skill when navigated with ?highlight=skillName
  useEffect(() => {
    if (!highlightName || loading) return;
    const el = skillRefs.current[highlightName];
    if (el) {
      // Small delay to ensure layout is settled
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedSkill(highlightName);
        // Clear highlight after animation
        const timer = setTimeout(() => setHighlightedSkill(null), 2000);
        // Clean up the search param so refreshing won't re-highlight
        setSearchParams({}, { replace: true });
        return () => clearTimeout(timer);
      });
    }
  }, [highlightName, loading, availableSkills, setSearchParams]);

  const handleImport = async (skillPath: string) => {
    try {
      const result = await ipcBridge.fs.importSkillWithSymlink.invoke({ skill_path: skillPath });
      const importedNames = result.skill_names?.length
        ? result.skill_names
        : result.skill_name
          ? [result.skill_name]
          : [];
      const count = importedNames.length;
      const names = importedNames.join(', ');
      Message.success(
        t('settings.skillsHub.importSuccessDetailed', {
          count,
          names,
          defaultValue: count > 1 ? `Imported ${count} skills: ${names}` : `Imported skill: ${names}`,
        })
      );
      setSearchQuery('');
      void fetchData();
    } catch (error) {
      console.error('Failed to import skill:', error);
      Message.error(t('settings.skillsHub.importError', { defaultValue: 'Error importing skill' }));
    }
  };

  const handleDelete = async (skillName: string) => {
    try {
      await ipcBridge.fs.deleteSkill.invoke({ skill_name: skillName });
      Message.success(t('settings.skillsHub.deleteSuccess', { defaultValue: 'Skill deleted' }));
      void fetchData();
    } catch (error) {
      console.error('Failed to delete skill:', error);
      Message.error(t('settings.skillsHub.deleteError', { defaultValue: 'Error deleting skill' }));
    }
  };

  const handleManualImport = async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: 'Skill folders or zip archives', extensions: ['zip'] }],
      });
      if (result && result.length > 0) {
        await handleImport(result[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const mainContent = (
    <div className='flex flex-col h-full w-full'>
      <div className='space-y-16px pb-24px'>
        {flowManagedSkillIds !== undefined && displayGroup !== 'manual' && (
          <section data-testid='opl-flow-managed-capabilities' className='relative overflow-hidden'>
            <div className='flex flex-col gap-12px sm:flex-row sm:items-start sm:justify-between'>
              <div>
                <Typography.Title heading={6} className='mb-4px'>
                  {t('settings.capabilitiesPage.groups.oplFlowManaged.title')}
                </Typography.Title>
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('settings.capabilitiesPage.groups.oplFlowManaged.description')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-tertiary'>
                  {t('settings.capabilitiesPage.groups.oplFlowManaged.source')}
                </Typography.Text>
              </div>
              {onSyncFlow && (
                <Button loading={flowSyncing} onClick={onSyncFlow} data-testid='settings-capabilities-primary-action'>
                  {t('settings.capabilitiesPage.groups.oplFlowManaged.sync')}
                </Button>
              )}
            </div>
            <div className='mt-14px flex flex-col divide-y divide-border-1'>
              {flowManagedSkills.map((skill) => (
                <div
                  key={skill.name}
                  className='flex items-start justify-between gap-12px py-10px'
                  data-testid={`opl-flow-capability-${normalizeTestId(skill.name)}`}
                >
                  <div className='min-w-0'>
                    <Typography.Text className='font-600 text-t-primary'>{skill.name}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {localizedCapabilitySummary([skill.name], skill.name, t)}
                    </Typography.Text>
                    <FlowCapabilityDetails
                      id={skill.name}
                      description={skill.description}
                      source={t('settings.capabilitiesPage.groups.oplFlowManaged.title')}
                      version={flowManagedSkillDependencyById.get(skill.name)?.version}
                      t={t}
                    />
                  </div>
                  <span
                    className={`opl-settings-status ${
                      flowManagedSkillIsInstalled(skill.name, true)
                        ? 'opl-settings-status--ready'
                        : 'opl-settings-status--attention'
                    }`}
                  >
                    {t(
                      flowManagedSkillIsInstalled(skill.name, true)
                        ? 'settings.capabilitiesPage.groups.oplFlowManaged.managed'
                        : 'settings.capabilitiesPage.groups.oplFlowManaged.missing'
                    )}
                  </span>
                </div>
              ))}
              {missingFlowManagedSkillIds.map((skillId) => (
                <div
                  key={skillId}
                  className='flex items-center justify-between gap-12px py-10px'
                  data-testid={`opl-flow-capability-${normalizeTestId(skillId)}`}
                >
                  <div className='min-w-0'>
                    <Typography.Text className='font-600 text-t-primary'>{skillId}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {localizedCapabilitySummary([skillId], skillId, t)}
                    </Typography.Text>
                    <FlowCapabilityDetails
                      id={skillId}
                      source={t('settings.capabilitiesPage.groups.oplFlowManaged.title')}
                      version={flowManagedSkillDependencyById.get(skillId)?.version}
                      t={t}
                    />
                  </div>
                  <span
                    className={`opl-settings-status ${
                      flowManagedSkillIsInstalled(skillId, false)
                        ? 'opl-settings-status--ready'
                        : 'opl-settings-status--attention'
                    }`}
                  >
                    {t(
                      flowManagedSkillIsInstalled(skillId, false)
                        ? 'settings.capabilitiesPage.groups.oplFlowManaged.managed'
                        : 'settings.capabilitiesPage.groups.oplFlowManaged.missing'
                    )}
                  </span>
                </div>
              ))}
              {flowManagedCliDependencies.map((dependency) => (
                <div
                  key={`${dependency.id}-${dependency.binaryPath ?? 'cli'}`}
                  className='flex items-start justify-between gap-12px py-10px'
                >
                  <div className='min-w-0'>
                    <Typography.Text className='font-600 text-t-primary'>{dependency.id}</Typography.Text>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {localizedCapabilitySummary([dependency.id], dependency.id, t)}
                    </Typography.Text>
                    <FlowCapabilityDetails
                      id={dependency.id}
                      source={t('settings.capabilitiesPage.groups.oplFlowManaged.title')}
                      version={dependency.version}
                      t={t}
                    />
                  </div>
                  <span
                    className={`opl-settings-status ${
                      dependency.currentness === 'current'
                        ? 'opl-settings-status--ready'
                        : 'opl-settings-status--attention'
                    }`}
                  >
                    {t(`settings.oplEnvironmentPage.dependencies.currentness.${dependency.currentness}`, {
                      defaultValue: dependency.currentness,
                    })}
                  </span>
                </div>
              ))}
              {flowManagedSkills.length === 0 &&
                missingFlowManagedSkillIds.length === 0 &&
                flowManagedCliDependencies.length === 0 && (
                  <Typography.Text className='py-12px text-12px text-t-secondary'>
                    {t('settings.capabilitiesPage.groups.oplFlowManaged.notReported')}
                  </Typography.Text>
                )}
            </div>
          </section>
        )}

        {displayGroup !== 'flow' && (
          <>
            {/* ======== 我的技能 / My Skills ======== */}
            <div
              data-testid={
                flowManagedSkillIds === undefined ? 'my-skills-section' : 'manual-and-third-party-capabilities'
              }
              className='relative overflow-hidden'
            >
              {/* Toolbar for My Skills */}
              <div className='relative z-10 mb-14px flex flex-col justify-between gap-12px lg:flex-row lg:items-center'>
                <div className='flex items-center gap-10px shrink-0'>
                  <span className='text-14px text-t-primary font-600'>
                    {flowManagedSkillIds === undefined
                      ? t('settings.skillsHub.mySkillsTitle', { defaultValue: 'My Skills' })
                      : t('settings.capabilitiesPage.groups.manualAndThirdParty.title')}
                  </span>
                  <span className='text-12px text-t-tertiary'>{mySkills.length}</span>
                  <Button
                    htmlType='button'
                    type='text'
                    data-testid='btn-refresh-my-skills'
                    className='ml-2px !flex !size-32px !min-w-32px !cursor-pointer !items-center !justify-center !border-0 !bg-transparent !p-0 !text-t-tertiary !rd-6px transition-colors hover:!bg-fill-2 hover:!text-t-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:!cursor-not-allowed disabled:!opacity-50'
                    icon={
                      <Refresh aria-hidden='true' theme='outline' size='16' className={loading ? 'animate-spin' : ''} />
                    }
                    onClick={async () => {
                      await fetchData();
                      Message.success(t('common.refreshSuccess', { defaultValue: 'Refreshed' }));
                    }}
                    disabled={loading}
                    title={t('common.refresh', { defaultValue: 'Refresh' })}
                    aria-label={t('common.refresh', { defaultValue: 'Refresh' })}
                    aria-busy={loading}
                  />
                </div>

                <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-12px w-full lg:w-auto shrink-0'>
                  <div className='shrink-0 w-full sm:w-[200px] lg:w-[240px]'>
                    <Input
                      data-testid='input-search-my-skills'
                      className='!h-32px w-full !bg-fill-1 !text-13px hover:!bg-fill-2 focus-within:!bg-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
                      prefix={<Search aria-hidden='true' size={15} />}
                      placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
                      aria-label={t('settings.skillsHub.searchLabel', { defaultValue: 'Search skills' })}
                      value={search_query}
                      onChange={setSearchQuery}
                    />
                  </div>

                  <Button
                    htmlType='button'
                    type='secondary'
                    size='small'
                    data-testid='btn-manual-import'
                    className='shrink-0 whitespace-nowrap'
                    onClick={handleManualImport}
                  >
                    {t('settings.skillsHub.manualImport', { defaultValue: 'Import Skills' })}
                  </Button>
                </div>
              </div>

              {/* Path Display moved below the toolbar */}
              {skillPaths && (
                <div className='relative z-10 mb-10px flex items-center gap-8px py-4px font-mono text-12px text-t-tertiary'>
                  <FolderOpen size={16} className='shrink-0' />
                  <span className='truncate' title={skillPaths.user_skills_dir}>
                    {skillPaths.user_skills_dir}
                  </span>
                </div>
              )}

              {mySkills.length > 0 ? (
                <div className='relative z-10 flex w-full flex-col divide-y divide-border-1 border-0 border-t border-solid border-border-1'>
                  {filteredSkills.map((skill) => (
                    <div
                      key={skill.name}
                      data-testid={`my-skill-card-${normalizeTestId(skill.name)}`}
                      ref={(el) => {
                        skillRefs.current[skill.name] = el;
                      }}
                      className={`group flex flex-col gap-12px py-12px transition-colors sm:flex-row ${highlightedSkill === skill.name ? 'bg-fill-1' : 'hover:bg-fill-1'}`}
                    >
                      <div className='shrink-0 flex items-start sm:mt-2px'>
                        <div className='flex size-28px items-center justify-center text-t-secondary'>
                          <Puzzle theme='outline' size='16' />
                        </div>
                      </div>

                      <div className='flex-1 min-w-0 flex flex-col justify-center gap-6px'>
                        <div className='flex items-center gap-10px flex-wrap'>
                          <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                          {skill.source === 'custom' ? (
                            <span className='text-11px text-t-tertiary'>
                              {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                            </span>
                          ) : (
                            <span className='text-11px text-t-tertiary'>
                              {t('settings.skillsHub.builtin', { defaultValue: 'Built-in' })}
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <p
                            className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'
                            title={skill.description}
                          >
                            {skill.description}
                          </p>
                        )}
                      </div>

                      <div className='shrink-0 sm:self-center flex items-center justify-end gap-6px mt-12px sm:mt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pl-4px'>
                        {skill.source === 'custom' && !flowManagedIdSet.has(skill.name) && (
                          <Button
                            htmlType='button'
                            type='text'
                            data-testid={`btn-delete-${normalizeTestId(skill.name)}`}
                            className='!flex !size-32px !min-w-32px !cursor-pointer !items-center !justify-center !border !border-transparent !bg-transparent !p-0 !text-t-tertiary !rd-6px transition-colors hover:!bg-danger-1 hover:!text-danger-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]'
                            icon={<Delete aria-hidden='true' theme='outline' size='16' fill='currentColor' />}
                            onClick={() => {
                              Modal.confirm({
                                title: t('settings.skillsHub.deleteConfirmTitle', { defaultValue: 'Delete Skill' }),
                                content: t('settings.skillsHub.deleteConfirmContent', {
                                  name: skill.name,
                                  defaultValue: `Are you sure you want to delete "${skill.name}"?`,
                                }),
                                okButtonProps: { status: 'danger' },
                                okText: t('common.delete', { defaultValue: 'Delete' }),
                                onOk: () => void handleDelete(skill.name),
                                wrapClassName: 'modal-delete-skill',
                              });
                            }}
                            title={t('common.delete', { defaultValue: 'Delete' })}
                            aria-label={t('common.delete', { defaultValue: 'Delete' })}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='relative z-10 border-0 border-t border-solid border-border-1 py-18px text-left text-13px text-t-secondary'>
                  {loading
                    ? t('common.loading', { defaultValue: 'Please wait...' })
                    : t('settings.skillsHub.noSkills', {
                        defaultValue: 'No skills found. Import some to get started.',
                      })}
                </div>
              )}
            </div>

            {/* ======== Extension Skills ======== */}
            {extensionSkills.length > 0 && (
              <div data-testid='extension-skills-section' className='relative overflow-hidden'>
                <div className='mb-10px flex items-center gap-10px'>
                  <Puzzle theme='outline' size='16' />
                  <span className='text-14px text-t-primary font-600'>
                    {t('settings.extensionSkills', { defaultValue: 'Extension Skills' })}
                  </span>
                  <span className='text-12px text-t-tertiary'>{extensionSkills.length}</span>
                </div>
                <div className='flex w-full flex-col divide-y divide-border-1 border-0 border-t border-solid border-border-1'>
                  {extensionSkills.map((skill) => (
                    <div
                      key={skill.name}
                      ref={(el) => {
                        skillRefs.current[skill.name] = el;
                      }}
                      className={`flex flex-col gap-12px py-12px transition-colors sm:flex-row ${highlightedSkill === skill.name ? 'bg-fill-1' : 'hover:bg-fill-1'}`}
                    >
                      <div className='shrink-0 flex items-start sm:mt-2px'>
                        <div className='flex size-28px items-center justify-center text-t-secondary'>
                          <Puzzle theme='outline' size='16' />
                        </div>
                      </div>
                      <div className='flex-1 min-w-0 flex flex-col justify-center gap-4px'>
                        <div className='flex items-center gap-10px'>
                          <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                          <span className='text-10px text-t-tertiary uppercase'>
                            {t('settings.extensionSkillsBadge', { defaultValue: 'Extension' })}
                          </span>
                        </div>
                        {skill.description && (
                          <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'>
                            {skill.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ======== Builtin Auto-injected Skills ======== */}
            {builtinAutoSkills.length > 0 && (
              <div data-testid='auto-skills-section' className='relative overflow-hidden'>
                <div className='mb-10px flex items-center gap-10px'>
                  <Lightning theme='outline' size='16' />
                  <span className='text-14px text-t-primary font-600'>{t('settings.autoInjectedSkills')}</span>
                  <span className='text-12px text-t-tertiary'>{builtinAutoSkills.length}</span>
                </div>
                <div className='flex w-full flex-col divide-y divide-border-1 border-0 border-t border-solid border-border-1'>
                  {builtinAutoSkills.map((skill) => (
                    <div
                      key={skill.name}
                      ref={(el) => {
                        skillRefs.current[skill.name] = el;
                      }}
                      className={`flex flex-col gap-12px py-12px transition-colors sm:flex-row ${highlightedSkill === skill.name ? 'bg-fill-1' : 'hover:bg-fill-1'}`}
                    >
                      <div className='shrink-0 flex items-start sm:mt-2px'>
                        <div className='flex size-28px items-center justify-center text-t-secondary'>
                          <Lightning theme='outline' size='16' />
                        </div>
                      </div>
                      <div className='flex-1 min-w-0 flex flex-col justify-center gap-4px'>
                        <div className='flex items-center gap-10px'>
                          <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                          <span className='text-10px text-t-tertiary uppercase'>
                            {t('settings.autoInjectedSkillsBadge')}
                          </span>
                        </div>
                        {skill.description && (
                          <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'>
                            {skill.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{mainContent}</SettingsPageWrapper> : mainContent;
};

export default SkillsHubSettings;
