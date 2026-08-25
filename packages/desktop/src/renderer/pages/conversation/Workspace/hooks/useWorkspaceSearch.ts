/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import useDebounce from '@/renderer/hooks/ui/useDebounce';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { useEffect, useRef, useState } from 'react';

type UseWorkspaceSearchParams = {
  workspace: string;
  loadWorkspace: (path: string, search?: string) => Promise<IDirOrFile[]>;
};

/**
 * Manages workspace search state, debounced search callback, and focus behavior.
 */
export function useWorkspaceSearch({ workspace, loadWorkspace }: UseWorkspaceSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const searchInputRef = useRef<RefInputType | null>(null);

  // Only focus search input when user actively opens search, not on conversation switch
  const previousShowSearchRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Skip focus on first render or conversation switch
    if (previousShowSearchRef.current === null) {
      previousShowSearchRef.current = showSearch;
      return;
    }

    // Only focus when transitioning from false to true (user actively opens search)
    if (showSearch && !previousShowSearchRef.current) {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus?.();
      }, 0);
      previousShowSearchRef.current = showSearch;
      return () => {
        window.clearTimeout(timer);
      };
    }

    previousShowSearchRef.current = showSearch;
  }, [showSearch]);

  // Debounced search handler
  const onSearch = useDebounce(
    (value: string) => {
      void loadWorkspace(workspace, value).then((files) => {
        setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
      });
    },
    200,
    [workspace, loadWorkspace]
  );

  return {
    searchText,
    setSearchText,
    showSearch,
    setShowSearch,
    searchInputRef,
    onSearch,
  };
}
