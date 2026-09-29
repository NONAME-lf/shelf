import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { extensionOf, isSafeFileName, type FileEntryDto } from '@shelf/shared';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { AuthUser } from '../auth/jwt.strategy';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { contentTypeFor } from './content-type';
import { ENTRY_INCLUDE, toFileEntryDto, type FileEntryRecord } from './file-entry.mapper';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(workspaceId: string): Promise<FileEntryDto[]> {
    const rows = await this.prisma.fileEntry.findMany({
      where: { workspaceId },
      include: ENTRY_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(toFileEntryDto);
  }

  /** A file of this workspace; a file of another workspace is reported exactly like a missing one. */
  async get(workspaceId: string, id: string): Promise<FileEntryRecord> {
    const row = await this.prisma.fileEntry.findFirst({ where: { id, workspaceId }, include: ENTRY_INCLUDE });
    if (!row) throw new NotFoundException('Файл не знайдено');
    return row;
  }

  /** Stores a new file, or a new version of the file with the same name (UC10). */
  async upsert(
    workspaceId: string,
    user: AuthUser,
    rawName: string,
    bytes: Buffer,
  ): Promise<{ entry: FileEntryDto; created: boolean }> {
    const name = rawName.trim();
    if (!isSafeFileName(name)) throw new BadRequestException(`Недопустима назва файлу: «${rawName}»`);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const contentType = contentTypeFor(name);

    const existing = await this.prisma.fileEntry.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) {
      await this.storage.put(existing.storageKey, bytes, contentType);
      const row = await this.prisma.fileEntry.update({
        where: { id: existing.id },
        data: { size: bytes.length, checksum, modifiedAt: new Date(), editedById: user.id },
        include: ENTRY_INCLUDE,
      });
      return { entry: toFileEntryDto(row), created: false };
    }

    const id = randomUUID();
    const storageKey = `workspaces/${workspaceId}/${id}`;
    await this.storage.put(storageKey, bytes, contentType);
    try {
      const row = await this.prisma.fileEntry.create({
        data: {
          id,
          workspaceId,
          name,
          extension: extensionOf(name),
          size: bytes.length,
          checksum,
          storageKey,
          uploadedById: user.id,
          editedById: user.id,
        },
        include: ENTRY_INCLUDE,
      });
      return { entry: toFileEntryDto(row), created: true };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      // Another request created the same name a moment ago: store this upload as its new version.
      if (isUniqueViolation(error)) return this.upsert(workspaceId, user, name, bytes);
      throw error;
    }
  }

  async content(workspaceId: string, id: string): Promise<{ entry: FileEntryRecord; stream: Readable }> {
    const entry = await this.get(workspaceId, id);
    return { entry, stream: await this.storage.get(entry.storageKey) };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const entry = await this.get(workspaceId, id);
    await this.prisma.fileEntry.delete({ where: { id: entry.id } });
    await this.storage.delete(entry.storageKey).catch((error: Error) => {
      this.logger.warn(`Object ${entry.storageKey} was not deleted: ${error.message}`);
    });
  }
}
