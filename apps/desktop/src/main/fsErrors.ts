/**
 * Node fs errors the user can cause (a deleted folder, no permission) reach the window in Ukrainian;
 * any other error passes through unchanged.
 */
export function explainFsError(error: unknown, path: string, kind: 'folder' | 'file'): unknown {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code === 'ENOENT') {
    return new Error(kind === 'folder' ? `Папку «${path}» не знайдено — виберіть її знову` : `Файл «${path}» не знайдено`);
  }
  if (code === 'EACCES' || code === 'EPERM') return new Error(`Немає доступу до «${path}»`);
  return error;
}
