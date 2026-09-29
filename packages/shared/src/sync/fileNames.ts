const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

/** A name the server accepts: non-empty, at most 255 characters, no path separators or control characters. */
export function isSafeFileName(name: string): boolean {
  if (name.trim().length === 0 || name.length > 255) return false;
  if (name === '.' || name === '..') return false;
  return !FORBIDDEN.test(name);
}

/**
 * Hidden files (".DS_Store", ".git") are never synchronized, nor is "__proto__": as a key of
 * the snapshot entries it would replace their prototype.
 */
export function isSyncableName(name: string): boolean {
  return isSafeFileName(name) && !name.startsWith('.') && name !== '__proto__';
}

/**
 * Names with the same key are one file on a case-insensitive file system (macOS by default,
 * Windows): they differ only in letter case or in Unicode normalization (NFC / NFD).
 */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

/** Every name whose key is shared by a different name. */
export function collidingNames(names: Iterable<string>): Set<string> {
  const byKey = new Map<string, Set<string>>();
  for (const name of names) {
    const key = nameKey(name);
    byKey.set(key, (byKey.get(key) ?? new Set<string>()).add(name));
  }
  return new Set([...byKey.values()].filter((group) => group.size > 1).flatMap((group) => [...group]));
}
