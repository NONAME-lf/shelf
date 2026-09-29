import { SortDirection, TypeFilter } from './types';

/** Lower-case extension without the dot; '' when there is none (hidden files like ".env" have none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareNames(a: string, b: string): number {
  const primary = collator.compare(a, b);
  if (primary !== 0) return primary;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Variant operation 6: sort by name, ascending or descending. Returns a new array. */
export function sortByName<T extends { name: string }>(files: readonly T[], direction: SortDirection): T[] {
  const sign = direction === SortDirection.DESCENDING ? -1 : 1;
  return [...files].sort((a, b) => sign * compareNames(a.name, b.name));
}

const FILTER_EXTENSION: Record<TypeFilter, string | null> = {
  [TypeFilter.ALL_FILES]: null,
  [TypeFilter.ONLY_CPP]: 'cpp',
  [TypeFilter.ONLY_PNG]: 'png',
};

/** Variant operation 6: filter «all files» / «only .cpp» / «only .png». Returns a new array. */
export function filterByType<T extends { name: string }>(files: readonly T[], filter: TypeFilter): T[] {
  const extension = FILTER_EXTENSION[filter];
  if (extension === null) return [...files];
  return files.filter((file) => extensionOf(file.name) === extension);
}

/** getVisibleFiles() = filterByType(sortByName(files, direction), filter) */
export function getVisibleFiles<T extends { name: string }>(
  files: readonly T[],
  direction: SortDirection,
  filter: TypeFilter,
): T[] {
  return filterByType(sortByName(files, direction), filter);
}

export function toggleDirection(direction: SortDirection): SortDirection {
  return direction === SortDirection.ASCENDING ? SortDirection.DESCENDING : SortDirection.ASCENDING;
}
