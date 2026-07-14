/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ProjectContextRef } from '@/common/config/configKeys';
import { addRecentWorkspace, getRecentWorkspaces, removeRecentWorkspace } from '@/renderer/components/workspace';
import { Button, Dropdown, Menu, Modal, Tooltip, Typography } from '@arco-design/web-react';
import { Attention, BranchOne, CloseSmall, Computer, FileText, FolderClose, Fork } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidWorkspaceFootnoteProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
  launchMode: GuidWorkspaceLaunchMode;
  onLaunchModeChange: (mode: GuidWorkspaceLaunchMode) => void;
  branchOptions: GuidStartingBranchOption[];
  selectedStartRef: string;
  onSelectedStartRefChange: (startRef: string) => void;
  worktreeLoading?: boolean;
  worktreeControlsDisabled?: boolean;
  worktreeError?: string | null;
  accessDisabled?: boolean;
  accessDisabledReason?: string;
  activeCapabilityLabel?: string;
  projectContextRefs?: ProjectContextRef[];
  onRemoveProjectContextRef?: (path: string) => void;
};

export type GuidWorkspaceLaunchMode = 'local' | 'worktree';

export type GuidStartingBranchOption = {
  value: string;
  label: string;
  current: boolean;
};

const FolderIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    fill='none'
    stroke='currentColor'
    strokeWidth='1.8'
    viewBox='0 0 24 24'
    style={{ lineHeight: 0, flexShrink: 0 }}
  >
    <path d='M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' />
  </svg>
);

const PlusIcon = () => (
  <svg
    width='13'
    height='13'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.8'
    viewBox='0 0 24 24'
    style={{ flexShrink: 0 }}
  >
    <path d='M12 5v14M5 12h14' />
  </svg>
);

const GuidWorkspaceFootnote: React.FC<GuidWorkspaceFootnoteProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
  launchMode,
  onLaunchModeChange,
  branchOptions,
  selectedStartRef,
  onSelectedStartRefChange,
  worktreeLoading = false,
  worktreeControlsDisabled = false,
  worktreeError,
  accessDisabled = false,
  accessDisabledReason,
  activeCapabilityLabel,
  projectContextRefs = [],
  onRemoveProjectContextRef,
}) => {
  const { t } = useTranslation();
  const recentWorkspaces = getRecentWorkspaces();
  const [open, setOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [registeredWorkspaces, setRegisteredWorkspaces] = useState(() => getRecentWorkspaces());
  const [searchQuery, setSearchQuery] = useState('');
  const [branch, setBranch] = useState<string>();
  const [launchModeMenuOpen, setLaunchModeMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBranch(undefined);
    if (!workspaceDir) return;

    void ipcBridge.gitWorkspace.inspect
      .invoke({ cwd: workspaceDir })
      .then((inspection) => {
        if (!cancelled && inspection.currentBranch) setBranch(inspection.currentBranch);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspaceDir]);

  const handleBrowseWorkspace = useCallback(() => {
    setOpen(false);
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((dirs) => {
        if (dirs && dirs[0]) {
          addRecentWorkspace(dirs[0]);
          onSelectWorkspace(dirs[0]);
        }
      })
      .catch((error) => {
        console.error('Failed to open directory dialog:', error);
      });
  }, [onSelectWorkspace]);

  const handleSelectPath = useCallback(
    (path: string) => {
      addRecentWorkspace(path);
      onSelectWorkspace(path);
      setOpen(false);
      setSearchQuery('');
    },
    [onSelectWorkspace]
  );

  const openDropdown = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The Codex-style context bar opens its project menu toward the composer.
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      top: rect.bottom + 6,
      minWidth: 230,
      zIndex: 9999,
    });
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
  }, []);

  const openWorkspaceManagement = useCallback(() => {
    closeDropdown();
    setRegisteredWorkspaces(getRecentWorkspaces());
    setManagementOpen(true);
  }, [closeDropdown]);

  const removeWorkspaceRegistration = useCallback((path: string) => {
    removeRecentWorkspace(path);
    setRegisteredWorkspaces(getRecentWorkspaces());
  }, []);

  const toggleOpen = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const activeWorkspaceOptions = workspaceDir ? [workspaceDir] : [];
  const filteredRecent = activeWorkspaceOptions.filter((p) => {
    if (!searchQuery) return true;
    const name = p.split(/[\\/]/).pop() || p;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) || p.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';
  const selectedBranch = branchOptions.find((option) => option.value === selectedStartRef);
  const branchLabel = launchMode === 'worktree' ? selectedBranch?.label || branch : branch;

  const launchModeButton = (
    <Button
      type='text'
      size='small'
      className={styles.taskContextControl}
      disabled={worktreeControlsDisabled}
      aria-label={t('guid.worktree.modeLabel')}
      data-testid='guid-launch-mode-trigger'
    >
      <span className={styles.taskContextControlContent}>
        {launchMode === 'worktree' ? <Fork size={16} /> : <Computer size={16} />}
        <span>{launchMode === 'worktree' ? t('guid.worktree.worktreeLabel') : t('guid.home.localContext')}</span>
      </span>
    </Button>
  );

  const launchModeControl = worktreeControlsDisabled ? (
    launchModeButton
  ) : (
    <Dropdown
      trigger='click'
      position='bl'
      popupVisible={launchModeMenuOpen}
      onVisibleChange={setLaunchModeMenuOpen}
      droplist={
        <Menu
          selectedKeys={[launchMode]}
          onClickMenuItem={(key) => {
            setLaunchModeMenuOpen(false);
            onLaunchModeChange(key === 'worktree' ? 'worktree' : 'local');
          }}
        >
          <Menu.Item key='local'>
            <span className={styles.taskContextMenuItem} data-testid='guid-launch-mode-local'>
              <Computer size={15} />
              {t('guid.home.localContext')}
            </span>
          </Menu.Item>
          <Menu.Item key='worktree'>
            <span className={styles.taskContextMenuItem} data-testid='guid-launch-mode-worktree'>
              <Fork size={15} />
              {t('guid.worktree.worktreeLabel')}
            </span>
          </Menu.Item>
        </Menu>
      }
    >
      {launchModeButton}
    </Dropdown>
  );

  const branchButton = branchLabel ? (
    <Button
      type='text'
      size='small'
      className={styles.taskContextControl}
      disabled={worktreeLoading || worktreeControlsDisabled}
      aria-label={t('guid.worktree.startingBranch')}
      aria-busy={worktreeLoading}
      data-testid='guid-starting-branch-selector'
    >
      <span className={styles.taskContextControlContent}>
        <BranchOne size={16} />
        <span className={styles.taskContextBranchLabel}>{branchLabel}</span>
      </span>
    </Button>
  ) : null;

  const branchControl =
    launchMode === 'worktree' && branchButton && branchOptions.length > 0 ? (
      <Dropdown
        trigger='click'
        position='bl'
        popupVisible={branchMenuOpen}
        onVisibleChange={setBranchMenuOpen}
        droplist={
          <Menu
            selectedKeys={selectedStartRef ? [selectedStartRef] : []}
            onClickMenuItem={(key) => {
              setBranchMenuOpen(false);
              onSelectedStartRefChange(String(key));
            }}
          >
            {branchOptions.map((option) => (
              <Menu.Item key={option.value}>
                <span className={styles.taskContextMenuItem}>
                  <BranchOne size={15} />
                  <span>{option.label}</span>
                  {option.current ? (
                    <span className={styles.taskContextMenuMeta}>{t('guid.worktree.currentBranch')}</span>
                  ) : null}
                </span>
              </Menu.Item>
            ))}
          </Menu>
        }
      >
        {branchButton}
      </Dropdown>
    ) : (
      branchButton
    );

  const dropdownEl = open
    ? createPortal(
        <div ref={dropdownRef} className={styles.wsDropdown} style={dropdownStyle}>
          <div className={styles.wsDropdownSearch}>
            <svg
              width='12'
              height='12'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              viewBox='0 0 24 24'
              style={{ flexShrink: 0, color: 'var(--color-text-3)' }}
            >
              <circle cx='11' cy='11' r='8' />
              <path d='M21 21l-4.35-4.35' />
            </svg>
            <input
              ref={searchRef}
              className={styles.wsDropdownSearchInput}
              placeholder={t('guid.workspace.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {filteredRecent.map((path) => {
            const name = path.split(/[\\/]/).pop() || path;
            const isActive = path === workspaceDir;
            return (
              <div
                key={path}
                className={`${styles.wsDropdownItem} ${isActive ? styles.wsDropdownItemActive : ''}`}
                onClick={() => handleSelectPath(path)}
              >
                <FolderIcon size={13} />
                <span className={styles.wsDropdownItemName}>{name}</span>
                {isActive && (
                  <svg
                    width='12'
                    height='12'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2.5'
                    viewBox='0 0 24 24'
                    style={{ marginLeft: 'auto', flexShrink: 0 }}
                  >
                    <path d='M20 6L9 17l-5-5' />
                  </svg>
                )}
              </div>
            );
          })}

          {filteredRecent.length > 0 && <div className={styles.wsDropdownSep} />}

          <div className={`${styles.wsDropdownItem} ${styles.wsDropdownItemAccent}`} onClick={handleBrowseWorkspace}>
            <PlusIcon />
            <span>{t('team.create.chooseDifferentFolder')}</span>
          </div>

          {recentWorkspaces.length > 0 && (
            <button
              type='button'
              className={`${styles.wsDropdownItem} ${styles.wsDropdownItemButton} ${styles.wsDropdownItemMuted}`}
              onClick={openWorkspaceManagement}
              aria-label={t('guid.workspace.manageRegistered')}
            >
              <FolderIcon size={13} />
              <span>{t('guid.workspace.manageRegistered')}</span>
            </button>
          )}

          <>
            <div className={styles.wsDropdownSep} />
            <div
              className={`${styles.wsDropdownItem} ${workspaceDir ? styles.wsDropdownItemMuted : styles.wsDropdownItemMutedDisabled}`}
              onClick={() => {
                if (workspaceDir) onClearWorkspace();
                closeDropdown();
              }}
            >
              <svg
                width='13'
                height='13'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                viewBox='0 0 24 24'
                style={{ flexShrink: 0 }}
              >
                <path d='M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' />
                <line x1='2' y1='2' x2='22' y2='22' strokeWidth='1.5' />
              </svg>
              <span>{t('guid.workspace.noProject')}</span>
            </div>
          </>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      className={styles.workspaceFootnote}
      data-testid='guid-new-task-context-bar'
      data-access-disabled={accessDisabled ? 'true' : 'false'}
    >
      <div className={styles.taskContextPrimary} data-testid='guid-task-location-controls'>
        {workspaceDir ? (
          <>
            <Tooltip content={accessDisabled ? accessDisabledReason : workspaceDir} position='top'>
              <div
                className={styles.workspacePill}
                data-testid={accessDisabled ? 'opl-guid-workspace-access-disabled' : undefined}
              >
                <button
                  ref={triggerRef as React.RefObject<HTMLButtonElement>}
                  className={styles.workspacePillMain}
                  onClick={accessDisabled ? undefined : toggleOpen}
                  disabled={accessDisabled}
                  aria-label={accessDisabled ? accessDisabledReason : undefined}
                >
                  <FolderIcon size={17} />
                  <span className={styles.workspacePillName}>{workspaceName}</span>
                </button>
              </div>
            </Tooltip>
            {dropdownEl}
          </>
        ) : (
          <>
            <Tooltip content={accessDisabled ? accessDisabledReason : t('guid.workspace.workInProject')} position='top'>
              <span data-testid={accessDisabled ? 'opl-guid-workspace-access-disabled' : undefined}>
                <button
                  ref={triggerRef as React.RefObject<HTMLButtonElement>}
                  className={styles.workspaceEmptyBtn}
                  data-testid='workspace-selector-btn'
                  onClick={recentWorkspaces.length > 0 ? toggleOpen : handleBrowseWorkspace}
                  disabled={accessDisabled}
                  aria-label={accessDisabled ? accessDisabledReason : undefined}
                >
                  <FolderIcon size={17} />
                  <span data-testid='guid-projectless-context'>{t('guid.workspace.noProject')}</span>
                </button>
              </span>
            </Tooltip>
            {dropdownEl}
          </>
        )}
        <span className={styles.taskContextItem} data-testid='guid-local-context'>
          {launchModeControl}
        </span>
        {workspaceDir && branchControl ? (
          <span className={styles.taskContextItem} data-testid='guid-branch-context'>
            {branchControl}
          </span>
        ) : null}
      </div>

      {worktreeError ? (
        <div className={styles.taskContextError} role='alert' data-testid='guid-worktree-error'>
          <Attention className='mt-2px shrink-0' size={13} />
          <span className='min-w-0 break-words'>{worktreeError}</span>
        </div>
      ) : null}

      {activeCapabilityLabel || projectContextRefs.length > 0 ? (
        <div className={styles.taskContextSecondary} data-testid='guid-task-context-secondary'>
          {activeCapabilityLabel ? (
            <span className={styles.contextStripMeta} data-testid='guid-active-capability'>
              {t('guid.home.activeCapability', { capability: activeCapabilityLabel })}
            </span>
          ) : null}
          {projectContextRefs.map((ref) => (
            <Tooltip key={ref.path} content={ref.path} position='top'>
              <span className={styles.projectContextRef} data-testid='guid-project-context-ref'>
                {ref.isFile ? <FileText size={12} /> : <FolderClose size={12} />}
                <span className={styles.projectContextRefName}>{ref.relativePath || ref.name}</span>
                <Button
                  type='text'
                  size='mini'
                  className={styles.projectContextRefRemove}
                  icon={<CloseSmall size={11} />}
                  aria-label={t('conversation.history.projectContext.remove', { name: ref.name })}
                  onClick={() => onRemoveProjectContextRef?.(ref.path)}
                />
              </span>
            </Tooltip>
          ))}
        </div>
      ) : null}
      <Modal
        visible={managementOpen}
        title={t('guid.workspace.registeredTitle')}
        footer={null}
        onCancel={() => setManagementOpen(false)}
        unmountOnExit
      >
        <Typography.Text className='block pb-12px text-13px text-t-secondary'>
          {t('guid.workspace.registeredDescription')}
        </Typography.Text>
        <div className='flex flex-col divide-y divide-border-1' data-testid='registered-workspace-list'>
          {registeredWorkspaces.map((path) => {
            const name = path.split(/[\\/]/).pop() || path;
            return (
              <div key={path} className='flex min-w-0 items-center gap-10px py-10px'>
                <FolderIcon size={14} />
                <div className='min-w-0 flex-1'>
                  <Typography.Text className='block font-500 text-t-primary'>{name}</Typography.Text>
                  <Typography.Text className='block break-all text-12px text-t-secondary'>{path}</Typography.Text>
                </div>
                <Button
                  type='text'
                  status='danger'
                  onClick={() => removeWorkspaceRegistration(path)}
                  aria-label={t('guid.workspace.removeRegistered', { name })}
                >
                  {t('guid.workspace.removeRegisteredAction')}
                </Button>
              </div>
            );
          })}
          {registeredWorkspaces.length === 0 && (
            <Typography.Text className='py-12px text-13px text-t-secondary'>
              {t('guid.workspace.noRegistered')}
            </Typography.Text>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default GuidWorkspaceFootnote;
