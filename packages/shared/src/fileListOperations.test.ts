import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  filterByType,
  getVisibleFiles,
  sortByName,
  toggleDirection,
} from './fileListOperations';
import { fileEntry, names } from './test/fixtures';
import { SortDirection, TypeFilter } from './types';

const files = ['b.txt', 'A.kt', 'photo.jpg', 'main.cpp', 'logo.png', 'Zeta.CPP', 'notes'].map((name) =>
  fileEntry(name),
);

describe('extensionOf', () => {
  it.each([
    ['Main.kt', 'kt'],
    ['PHOTO.JPG', 'jpg'],
    ['archive.tar.gz', 'gz'],
    ['noext', ''],
    ['.env', ''],
    ['trailing.', ''],
  ])('%s → "%s"', (name, ext) => {
    expect(extensionOf(name)).toBe(ext);
  });
});

describe('sortByName — операція варіанта: сортування за назвою', () => {
  it('sorts ascending, ignoring letter case', () => {
    expect(names(sortByName(files, SortDirection.ASCENDING))).toEqual([
      'A.kt', 'b.txt', 'logo.png', 'main.cpp', 'notes', 'photo.jpg', 'Zeta.CPP',
    ]);
  });

  it('sorts descending as the exact reverse', () => {
    expect(names(sortByName(files, SortDirection.DESCENDING))).toEqual([
      'Zeta.CPP', 'photo.jpg', 'notes', 'main.cpp', 'logo.png', 'b.txt', 'A.kt',
    ]);
  });

  it('orders numbers inside names naturally', () => {
    const numbered = ['file10.txt', 'file2.txt', 'file1.txt'].map((name) => fileEntry(name));
    expect(names(sortByName(numbered, SortDirection.ASCENDING))).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  it('does not mutate the input', () => {
    const before = names(files);
    sortByName(files, SortDirection.DESCENDING);
    expect(names(files)).toEqual(before);
  });

  it('toggles the direction', () => {
    expect(toggleDirection(SortDirection.ASCENDING)).toBe(SortDirection.DESCENDING);
    expect(toggleDirection(SortDirection.DESCENDING)).toBe(SortDirection.ASCENDING);
  });
});

describe('filterByType — операція варіанта: фільтр «усі / лише .cpp / лише .png»', () => {
  it('ONLY_CPP keeps only .cpp files, any letter case', () => {
    expect(names(filterByType(files, TypeFilter.ONLY_CPP))).toEqual(['main.cpp', 'Zeta.CPP']);
  });

  it('ONLY_PNG keeps only .png files', () => {
    expect(names(filterByType(files, TypeFilter.ONLY_PNG))).toEqual(['logo.png']);
  });

  it('ALL_FILES keeps everything and returns a copy', () => {
    const result = filterByType(files, TypeFilter.ALL_FILES);
    expect(names(result)).toEqual(names(files));
    expect(result).not.toBe(files);
  });

  it('does not match a name that only contains "cpp"', () => {
    const tricky = ['cpp', 'x.cpp.bak', 'readme-cpp.txt'].map((name) => fileEntry(name));
    expect(filterByType(tricky, TypeFilter.ONLY_CPP)).toEqual([]);
  });
});

describe('getVisibleFiles — filter on top of the sorted list', () => {
  it('keeps the chosen order after filtering', () => {
    expect(names(getVisibleFiles(files, SortDirection.DESCENDING, TypeFilter.ONLY_CPP))).toEqual([
      'Zeta.CPP', 'main.cpp',
    ]);
  });

  it('equals filterByType(sortByName(files, direction), filter)', () => {
    for (const direction of Object.values(SortDirection)) {
      for (const filter of Object.values(TypeFilter)) {
        expect(getVisibleFiles(files, direction, filter)).toEqual(
          filterByType(sortByName(files, direction), filter),
        );
      }
    }
  });
});
