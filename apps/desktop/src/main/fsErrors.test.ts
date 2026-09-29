import { describe, expect, it } from 'vitest';
import { explainFsError } from './fsErrors';

const failure = (code: string) => Object.assign(new Error(`${code}: raw Node message, '/Users/artem/Shelf'`), { code });

describe('explainFsError', () => {
  it('asks to choose a missing folder again', () => {
    expect(explainFsError(failure('ENOENT'), '/Users/artem/Shelf', 'folder')).toEqual(
      new Error('Папку «/Users/artem/Shelf» не знайдено — виберіть її знову'),
    );
  });

  it('names a missing file', () => {
    expect(explainFsError(failure('ENOENT'), '/Users/artem/Shelf/todo.txt', 'file')).toEqual(
      new Error('Файл «/Users/artem/Shelf/todo.txt» не знайдено'),
    );
  });

  it.each(['EACCES', 'EPERM'])('explains %s as missing access', (code) => {
    expect(explainFsError(failure(code), '/Users/artem/Shelf', 'folder')).toEqual(new Error('Немає доступу до «/Users/artem/Shelf»'));
    expect(explainFsError(failure(code), '/Users/artem/report.pdf', 'file')).toEqual(new Error('Немає доступу до «/Users/artem/report.pdf»'));
  });

  it('passes any other error through unchanged', () => {
    const busy = failure('EBUSY');
    expect(explainFsError(busy, '/Users/artem/Shelf', 'folder')).toBe(busy);
    expect(explainFsError('not an error', '/Users/artem/Shelf', 'folder')).toBe('not an error');
  });
});
