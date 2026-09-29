import { describe, expect, it } from 'vitest';
import { collidingNames, isSafeFileName, isSyncableName, nameKey } from './fileNames';

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

  it('does not synchronize a file named __proto__ (it would replace the prototype of the snapshot entries)', () => {
    expect(isSyncableName('__proto__')).toBe(false);
    expect(isSyncableName('constructor')).toBe(true);
  });
});

describe('names that are one file on a case-insensitive file system', () => {
  const nfc = '\u00e9t\u00e9.txt'; // «été.txt», precomposed
  const nfd = 'e\u0301te\u0301.txt'; // the same letters, decomposed

  it('gives the same key to names that differ only in case or Unicode form', () => {
    expect(nameKey('Main.kt')).toBe(nameKey('main.KT'));
    expect(nfc).not.toBe(nfd);
    expect(nameKey(nfc)).toBe(nameKey(nfd));
    expect(nameKey('Main.kt')).not.toBe(nameKey('Main.kts'));
  });

  it('finds every name whose key is shared by a different name', () => {
    const names = ['Main.kt', 'notes.txt', 'main.kt', nfc, nfd, 'MAIN.KT', 'photo.jpg'];
    expect(collidingNames(names)).toEqual(new Set(['Main.kt', 'main.kt', 'MAIN.KT', nfc, nfd]));
  });

  it('does not treat the same name seen twice as a collision', () => {
    expect(collidingNames(['Main.kt', 'Main.kt', 'notes.txt'])).toEqual(new Set());
  });
});
