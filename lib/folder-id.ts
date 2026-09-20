/**
 * Folder ids as the board uses them, versus as folder_words stores them.
 *
 * Open folders are `folder:people`, `core:people`, `folder:phrases`. The extra
 * words table stores the situation folders under the bare id (`people`), core
 * folders under `core:people`, and my phrases under `phrases`. Adding used to
 * write the open-folder id straight in, so a new button vanished: it was saved
 * as `folder:people` and read back as `people`.
 */

export function canonicalFolderId(folderId: string): string {
  const trimmed = folderId.trim();
  if (trimmed.startsWith('folder:')) return trimmed.slice('folder:'.length);
  return trimmed;
}

export function isCoreFolderId(folderId: string): boolean {
  return folderId.startsWith('core:');
}

export function isPhrasesFolderId(folderId: string): boolean {
  const bare = canonicalFolderId(folderId);
  return bare === 'phrases';
}

/** Ids that should match a situation-folder read of `people`. */
export function folderIdAliases(folderId: string): string[] {
  const canonical = canonicalFolderId(folderId);
  if (canonical === folderId) return [folderId, `folder:${folderId}`];
  return [canonical, folderId];
}
