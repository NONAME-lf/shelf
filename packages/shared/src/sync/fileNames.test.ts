import { describe, expect, it } from 'vitest';
import { isSafeFileName, isSyncableName } from './fileNames';

describe('file names', () => {
  it.each(['Main.kt', 'Звіт 2026.txt', '.gitignore', 'a'.repeat(255)])('accepts %s', (name) => {
    expect(isSafeFileName(name)).toBe(true);
  });

  it.each(['', '   ', '.', '..', 'a/b.txt', 'a\\b.txt', 'bell\u0007.txt', 'a'.repeat(256)])('rejects %j', (name) => {
    expect(isSafeFileName(name)).toBe(false);
  });

  it('does not synchronize hidden files', () => {
    expect(isSyncableName('.DS_Store')).toBe(false);
    expect(isSyncableName('Main.kt')).toBe(true);
  });
});
