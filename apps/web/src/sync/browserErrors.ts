export function errorName(error: unknown): string | undefined {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : undefined;
}

/** The user closed the directory picker. */
export function isAbortError(error: unknown): boolean {
  return errorName(error) === 'AbortError';
}

const STORAGE_UNAVAILABLE = 'Не вдалося звернутися до сховища браузера (IndexedDB) — оновіть сторінку і спробуйте ще раз';

/**
 * File System Access errors the user can cause (a deleted or moved folder, a withdrawn permission, a file
 * another program holds) and IndexedDB errors reach the window in Ukrainian; any other error passes
 * through unchanged. `folder` is null when no folder is involved — the error then comes from the
 * browser's own storage (IndexedDB), where the same DOMException names mean something else.
 */
export function explainBrowserError(error: unknown, folder: string | null, file?: string): unknown {
  const name = errorName(error);
  if (folder === null) return explainStorageError(name) ?? error;
  switch (name) {
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

function explainStorageError(name: string | undefined): Error | null {
  switch (name) {
    case 'QuotaExceededError':
      return new Error('Недостатньо місця у сховищі браузера для налаштувань синхронізації');
    case 'InvalidStateError':
      return new Error('Сховище браузера недоступне (можливо, приватне вікно) — налаштування синхронізації не збережуться');
    case 'SecurityError':
    case 'NotAllowedError':
      return new Error('Браузер заборонив доступ до свого сховища — перевірте налаштування сайту');
    case 'UnknownError':
    case 'NotFoundError':
    case 'VersionError':
    case 'DataError':
    case 'ConstraintError':
    case 'ReadOnlyError':
    case 'TransactionInactiveError':
      return new Error(STORAGE_UNAVAILABLE);
    default:
      return null;
  }
}

/** The directory picker failed for a reason other than the user closing it. */
export function explainPickerError(): Error {
  return new Error('Не вдалося відкрити вибір папки — натисніть «Змінити» або «Обрати папку» ще раз');
}
