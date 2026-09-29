import { extensionOf } from '../fileListOperations';
import type { FileEntryDto, LocalFile } from '../types';

export const T0 = Date.parse('2026-09-01T10:00:00.000Z');

let sequence = 0;

export function fileEntry(name: string, overrides: Partial<FileEntryDto> = {}): FileEntryDto {
  sequence += 1;
  return {
    id: `id-${sequence}`,
    name,
    extension: extensionOf(name),
    size: 10,
    checksum: 'c'.repeat(64),
    createdAt: new Date(T0).toISOString(),
    modifiedAt: new Date(T0).toISOString(),
    uploadedBy: 'Артем',
    editedBy: 'Артем',
    ...overrides,
  };
}

export function localFile(name: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return { name, path: `/tmp/shelf/${name}`, size: 10, modifiedAt: T0, ...overrides };
}

export const names = (files: readonly { name: string }[]): string[] => files.map((file) => file.name);
