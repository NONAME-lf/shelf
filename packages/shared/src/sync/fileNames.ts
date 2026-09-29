const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

/** A name the server accepts: non-empty, at most 255 characters, no path separators or control characters. */
export function isSafeFileName(name: string): boolean {
  if (name.trim().length === 0 || name.length > 255) return false;
  if (name === '.' || name === '..') return false;
  return !FORBIDDEN.test(name);
}

/** Hidden files (".DS_Store", ".git") are never synchronized. */
export function isSyncableName(name: string): boolean {
  return isSafeFileName(name) && !name.startsWith('.');
}
