import type { FileEntry } from '@prisma/client';
import type { FileEntryDto } from '@shelf/shared';

export const ENTRY_INCLUDE = {
  uploadedBy: { select: { displayName: true } },
  editedBy: { select: { displayName: true } },
} as const;

export type FileEntryRecord = FileEntry & { uploadedBy: { displayName: string }; editedBy: { displayName: string } };

export function toFileEntryDto(record: FileEntryRecord): FileEntryDto {
  return {
    id: record.id,
    name: record.name,
    extension: record.extension,
    size: record.size,
    checksum: record.checksum,
    createdAt: record.createdAt.toISOString(),
    modifiedAt: record.modifiedAt.toISOString(),
    uploadedBy: record.uploadedBy.displayName,
    editedBy: record.editedBy.displayName,
  };
}
