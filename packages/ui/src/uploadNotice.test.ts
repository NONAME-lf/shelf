import { describe, expect, it } from 'vitest';
import { describeUpload } from './uploadNotice';

describe('describeUpload', () => {
  it('names what was uploaded, skipped as too large and failed', () => {
    expect(describeUpload({ uploaded: 1, rejected: ['huge.bin'], errors: [] })).toBe(
      'Завантажено файлів: 1. Більші за 50 МБ і пропущені: huge.bin',
    );
    expect(describeUpload({ uploaded: 0, rejected: [], errors: ['a.txt: Сервер недоступний'] })).toBe(
      'Помилки: a.txt: Сервер недоступний',
    );
  });

  it('says nothing when nothing happened', () => {
    expect(describeUpload({ uploaded: 0, rejected: [], errors: [] })).toBeNull();
  });
});
