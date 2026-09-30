export function errorName(error: unknown): string | undefined {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : undefined;
}

/** The user closed the directory picker. */
export function isAbortError(error: unknown): boolean {
  return errorName(error) === 'AbortError';
}

/**
 * File System Access errors the user can cause (a deleted or moved folder, a withdrawn permission, a file
 * another program holds) reach the window in Ukrainian; any other error passes through unchanged.
 */
export function explainBrowserError(error: unknown, folder: string, file?: string): unknown {
  switch (errorName(error)) {
    case 'NotFoundError':
      return new Error(file ? `Файл «${file}» не знайдено` : `Папку «${folder}» не знайдено — виберіть її знову`);
    case 'NotAllowedError':
    case 'SecurityError':
      return new Error(`Немає доступу до папки «${folder}» — натисніть «Синхронізувати» і дозвольте доступ`);
    case 'TypeMismatchError':
      return new Error(`«${file ?? folder}»: у папці вже є вкладена папка з такою назвою`);
    case 'NoModificationAllowedError':
    case 'InvalidStateError':
      return new Error(`«${file ?? folder}» зараз змінює інша програма — спробуйте ще раз`);
    case 'QuotaExceededError':
      return new Error(`Недостатньо місця на диску для «${file ?? folder}»`);
    default:
      return error;
  }
}
