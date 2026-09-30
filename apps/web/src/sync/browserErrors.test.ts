import { describe, expect, it } from 'vitest';
import { explainBrowserError, explainPickerError, isAbortError } from './browserErrors';

const dom = (name: string) => new DOMException('english text', name);
const messageFor = (name: string, folder: string | null, file?: string) =>
  (explainBrowserError(dom(name), folder, file) as Error).message;

describe('explainBrowserError', () => {
  it('translates folder errors and names the folder or the file', () => {
    expect(messageFor('NotFoundError', 'Shelf')).toBe('Папку «Shelf» не знайдено — виберіть її знову');
    expect(messageFor('NotFoundError', 'Shelf', 'a.txt')).toBe('Файл «a.txt» не знайдено');
    expect(messageFor('QuotaExceededError', 'Shelf', 'a.txt')).toBe('Недостатньо місця на диску для «a.txt»');
    expect(messageFor('InvalidStateError', 'Shelf', 'a.txt')).toBe('«a.txt» зараз змінює інша програма — спробуйте ще раз');
  });

  it('translates IndexedDB errors when no folder is involved', () => {
    expect(messageFor('QuotaExceededError', null)).toBe('Недостатньо місця у сховищі браузера для налаштувань синхронізації');
    expect(messageFor('InvalidStateError', null)).toContain('Сховище браузера недоступне');
    expect(messageFor('SecurityError', null)).toContain('заборонив доступ до свого сховища');
    for (const name of ['UnknownError', 'VersionError', 'DataError', 'ConstraintError', 'TransactionInactiveError']) {
      expect(messageFor(name, null)).toBe(
        'Не вдалося звернутися до сховища браузера (IndexedDB) — оновіть сторінку і спробуйте ще раз',
      );
    }
  });

  it('passes other errors through unchanged', () => {
    const plain = new Error('Спочатку увійдіть до системи');
    expect(explainBrowserError(plain, null)).toBe(plain);
    expect(explainBrowserError(plain, 'Shelf')).toBe(plain);
  });
});

describe('picker errors', () => {
  it('tells a closed picker from a failed one', () => {
    expect(isAbortError(dom('AbortError'))).toBe(true);
    expect(isAbortError(dom('SecurityError'))).toBe(false);
    expect(explainPickerError().message).toContain('Не вдалося відкрити вибір папки');
  });
});
