export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export function splitBySize<T extends { size: number }>(files: readonly T[]): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const file of files) (file.size <= MAX_UPLOAD_BYTES ? accepted : rejected).push(file);
  return { accepted, rejected };
}
