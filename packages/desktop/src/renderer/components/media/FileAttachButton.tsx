/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { filterOplOrdinaryMcpStatuses, filterOplOrdinarySkillNames } from '@/common/config/oplProductProfile';
import type { IConversationMcpStatus } from '@/common/config/storage';
import ComposerCapabilityPalette, {
  type ComposerCapabilityPaletteGroup,
  type ComposerCapabilityPaletteItem,
} from '@/renderer/components/chat/composer/ComposerCapabilityPalette';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { FileService, type FileMetadata } from '@/renderer/services/FileService';
import { emitter } from '@/renderer/utils/emitter';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Message } from '@arco-design/web-react';
import { FolderOpen, Lightning, Link, Paperclip, Plus } from '@icon-park/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

interface FileAttachButtonProps {
  openFileSelector: () => void;
  openDirectorySelector?: () => void;
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  loadedSkills?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  sessionModeItems?: ComposerCapabilityPaletteItem[];
  onPaletteOpenChange?: (open: boolean) => void;
}

const buildLoadedMcpStatuses = (
  statuses?: IConversationMcpStatus[],
  legacyNames?: string[]
): IConversationMcpStatus[] => {
  if (Array.isArray(statuses) && statuses.length > 0) return statuses;
  return (legacyNames ?? []).map((name) => ({ id: name, name, status: 'loaded' }));
};

const FileAttachButton: React.FC<FileAttachButtonProps> = ({
  openFileSelector,
  openDirectorySelector,
  onLocalFilesAdded,
  loadedSkills,
  loadedMcpStatuses,
  sessionModeItems = [],
  onPaletteOpenChange,
}) => {
  const conversationContext = useConversationContextSafe();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      onPaletteOpenChange?.(nextOpen);
    },
    [onPaletteOpenChange]
  );

  const skillNames = filterOplOrdinarySkillNames(loadedSkills ?? conversationContext?.loadedSkills ?? []);
  const mcpStatuses = filterOplOrdinaryMcpStatuses(
    buildLoadedMcpStatuses(
      loadedMcpStatuses ?? conversationContext?.loadedMcpStatuses,
      conversationContext?.loadedMcpServers
    )
  );
  const { data: skillIndex } = useSWR(skillNames.length > 0 ? 'skills-index' : null, () =>
    ipcBridge.fs.listAvailableSkills.invoke()
  );
  const descriptionByName = useMemo(
    () => new Map((skillIndex ?? []).map((skill) => [skill.name, skill.description])),
    [skillIndex]
  );

  const handleLocalFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      setUploading(true);
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversation_id);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      } finally {
        setUploading(false);
      }
      event.target.value = '';
    },
    [conversationContext?.conversation_id, onLocalFilesAdded, t]
  );

  const paletteGroups = useMemo<ComposerCapabilityPaletteGroup[]>(() => {
    const localInputItems: ComposerCapabilityPaletteItem[] = [
      {
        id: 'attach-file',
        label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
        description: t('common.fileAttach.addFilesDescription'),
        icon: <OplIcon icon={Paperclip} size={16} />,
        onSelect: openFileSelector,
      },
    ];
    if (openDirectorySelector) {
      localInputItems.push({
        id: 'attach-directory',
        label: t('common.fileAttach.addFolder', { defaultValue: 'Add folder' }),
        description: t('common.fileAttach.addFolderDescription'),
        icon: <OplIcon icon={FolderOpen} size={16} />,
        onSelect: openDirectorySelector,
      });
    }
    if (!isElectronDesktop()) {
      localInputItems.push({
        id: 'attach-device',
        label: t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' }),
        description: t('common.fileAttach.myDeviceDescription'),
        icon: <OplIcon icon={FolderOpen} size={16} />,
        disabled: !onLocalFilesAdded,
        onSelect: () => fileInputRef.current?.click(),
      });
    }
    const skillItems: ComposerCapabilityPaletteItem[] = skillNames.map((name) => ({
      id: `skill-${name}`,
      label: name,
      description: descriptionByName.get(name),
      keywords: ['skill'],
      icon: <OplIcon icon={Lightning} size={16} />,
      onSelect: () => emitter.emit('sendbox.fill', `/${name} `),
    }));
    if (skillItems.length === 0) {
      skillItems.push({
        id: 'manage-skills',
        label: t('conversation.skills.manage'),
        description: t('conversation.skills.empty'),
        icon: <OplIcon icon={Lightning} size={16} />,
        onSelect: () => void navigate('/settings/capabilities?tab=skills'),
      });
    }

    const connectionItems: ComposerCapabilityPaletteItem[] = [];
    mcpStatuses.forEach((status) => {
      connectionItems.push({
        id: `connection-${status.id}`,
        label: status.name,
        description: status.reason,
        keywords: ['connection', 'app'],
        icon: <OplIcon icon={Link} size={16} />,
        meta: t(`conversation.mcp.status.${status.status}` as const),
        disabled: true,
        onSelect: () => undefined,
      });
    });
    if (connectionItems.length === 0) {
      connectionItems.push({
        id: 'manage-connections',
        label: t('conversation.mcp.manage'),
        description: t('conversation.mcp.empty'),
        icon: <OplIcon icon={Link} size={16} />,
        onSelect: () => void navigate('/settings/capabilities?tab=tools'),
      });
    }

    const groups: ComposerCapabilityPaletteGroup[] = [
      { id: 'local_inputs', label: t('guid.context.localInputsGroup'), items: localInputItems },
      { id: 'agent_packages', label: t('guid.context.agentPackagesGroup'), items: [] },
      { id: 'skills', label: t('guid.context.skillsGroup'), items: skillItems },
    ];
    if (sessionModeItems.length > 0) {
      groups.push({ id: 'session_modes', label: t('guid.context.sessionModesGroup'), items: sessionModeItems });
    }
    groups.push({
      id: 'apps_and_connections',
      label: t('guid.context.appsAndConnectionsGroup'),
      items: connectionItems,
    });
    return groups;
  }, [
    descriptionByName,
    mcpStatuses,
    navigate,
    onLocalFilesAdded,
    openDirectorySelector,
    openFileSelector,
    sessionModeItems,
    skillNames,
    t,
  ]);

  const trigger = (
    <Button
      type='secondary'
      shape='circle'
      icon={<OplIcon icon={Plus} size={14} />}
      loading={uploading}
      disabled={uploading}
      data-testid='aionrs-attach-folder-btn'
      aria-label={t('guid.context.addContext')}
      aria-expanded={open}
    />
  );

  return (
    <>
      <ComposerCapabilityPalette
        open={open}
        onOpenChange={handleOpenChange}
        trigger={trigger}
        title={t('guid.context.paletteTitle')}
        searchPlaceholder={t('guid.context.searchPalette')}
        noResultsText={t('guid.context.noPaletteResults')}
        groups={paletteGroups}
        horizontalOffset={-16}
        testId='conversation-capability-palette'
      />
      <input
        ref={fileInputRef}
        type='file'
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalFileChange}
        data-testid='aionrs-file-upload-input'
      />
    </>
  );
};

export default FileAttachButton;
