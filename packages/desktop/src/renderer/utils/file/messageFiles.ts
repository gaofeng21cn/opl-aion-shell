import { type ChatFileRef, chatFileRefKey, localFileRef, uploadFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectChatFileRefs = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): ChatFileRef[] => {
  const refs: ChatFileRef[] = [];
  const seen = new Set<string>();
  const append = (ref: ChatFileRef): void => {
    const key = chatFileRefKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  for (const path of uploadFile) {
    if (path) append(uploadFileRef(path));
  }
  for (const item of atPath) {
    if (typeof item === 'string') {
      if (item) append(localFileRef(item));
    } else if (item.chatRef) {
      append(item.chatRef);
    } else if (item.path) {
      // Compatibility for the pre-Project-Explorer workspace tree: these are
      // backend-machine paths, not browser uploads under the managed /tmp root.
      append(localFileRef(item.path));
    }
  }
  return refs;
};

export const splitChatFileRefs = (
  refs: Array<ChatFileRef | string>
): { uploadFiles: string[]; atPath: FileOrFolderItem[] } => {
  const uploadFiles: string[] = [];
  const atPath: FileOrFolderItem[] = [];
  for (const rawRef of refs) {
    const ref = typeof rawRef === 'string' ? uploadFileRef(rawRef) : rawRef;
    if (ref.kind === 'upload') {
      uploadFiles.push(ref.path);
      continue;
    }
    const path = ref.kind === 'project' ? ref.relative_path : ref.path;
    atPath.push({
      path,
      name: path.split(/[\\/]/).pop() || path,
      isFile: true,
      chatRef: ref,
    });
  }
  return { uploadFiles, atPath };
};
