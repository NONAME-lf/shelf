import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { FilesService } from './files.service';

type Row = {
  id: string;
  workspaceId: string;
  name: string;
  extension: string;
  size: number;
  checksum: string;
  storageKey: string;
  createdAt: Date;
  modifiedAt: Date;
  uploadedById: string;
  editedById: string;
};

class FakePrisma {
  readonly rows: Row[] = [];
  readonly users = new Map([
    ['u-artem', { displayName: 'Артем' }],
    ['u-iryna', { displayName: 'Ірина' }],
  ]);

  private readonly withUsers = (row: Row) => ({
    ...row,
    uploadedBy: this.users.get(row.uploadedById)!,
    editedBy: this.users.get(row.editedById)!,
  });

  readonly fileEntry = {
    findMany: async ({ where }: { where: { workspaceId: string } }) =>
      this.rows
        .filter((row) => row.workspaceId === where.workspaceId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(this.withUsers),
    findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
      const row = this.rows.find((candidate) => candidate.id === where.id && candidate.workspaceId === where.workspaceId);
      return row ? this.withUsers(row) : null;
    },
    findUnique: async ({ where }: { where: { workspaceId_name: { workspaceId: string; name: string } } }) =>
      this.rows.find(
        (row) => row.workspaceId === where.workspaceId_name.workspaceId && row.name === where.workspaceId_name.name,
      ) ?? null,
    create: async ({ data }: { data: Omit<Row, 'createdAt' | 'modifiedAt'> }) => {
      const now = new Date();
      const row: Row = { createdAt: now, modifiedAt: now, ...data };
      this.rows.push(row);
      return this.withUsers(row);
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = this.rows.find((candidate) => candidate.id === where.id)!;
      Object.assign(row, data);
      return this.withUsers(row);
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.rows.findIndex((row) => row.id === where.id);
      return this.rows.splice(index, 1)[0];
    },
  };
}

class FakeStorage {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }
  async get(key: string): Promise<Readable> {
    return Readable.from([this.objects.get(key)!]);
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

const artem = { id: 'u-artem', email: 'artem@shelf.dev', displayName: 'Артем' };
const iryna = { id: 'u-iryna', email: 'iryna@shelf.dev', displayName: 'Ірина' };
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('FilesService', () => {
  let prisma: FakePrisma;
  let storage: FakeStorage;
  let files: FilesService;

  beforeEach(() => {
    prisma = new FakePrisma();
    storage = new FakeStorage();
    files = new FilesService(prisma as unknown as PrismaService, storage as unknown as StorageService);
  });

  afterEach(() => jest.useRealTimers());

  it('creates a new entry with the uploader as author and editor', async () => {
    const { entry, created } = await files.upsert('ws-1', artem, 'Main.kt', Buffer.from('fun main() {}'));

    expect(created).toBe(true);
    expect(entry).toMatchObject({
      name: 'Main.kt',
      extension: 'kt',
      size: 13,
      checksum: sha256('fun main() {}'),
      uploadedBy: 'Артем',
      editedBy: 'Артем',
    });
    expect(prisma.rows[0].storageKey).toBe(`workspaces/ws-1/${entry.id}`);
    expect(storage.objects.get(prisma.rows[0].storageKey)?.toString()).toBe('fun main() {}');
  });

  it('uploading the same name again updates the same entry (UC10)', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-29T10:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const first = await files.upsert('ws-1', artem, 'todo.txt', Buffer.from('v1'));
    jest.setSystemTime(new Date('2026-09-29T10:05:00.000Z'));
    const second = await files.upsert('ws-1', iryna, 'todo.txt', Buffer.from('version 2'));

    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(prisma.rows).toHaveLength(1);
    expect(second.entry).toMatchObject({
      uploadedBy: 'Артем',
      editedBy: 'Ірина',
      size: 9,
      checksum: sha256('version 2'),
      createdAt: '2026-09-29T10:00:00.000Z',
      modifiedAt: '2026-09-29T10:05:00.000Z',
    });
    expect(storage.objects.size).toBe(1);
    expect(storage.objects.get(prisma.rows[0].storageKey)?.toString()).toBe('version 2');
  });

  it.each(['../secret.txt', 'a/b.txt', 'a\\b.txt', '', '   ', '..'])('rejects the unsafe name %j', async (name) => {
    await expect(files.upsert('ws-1', artem, name, Buffer.from('x'))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.objects.size).toBe(0);
  });

  it("does not expose another workspace's file", async () => {
    const { entry } = await files.upsert('ws-1', artem, 'Main.kt', Buffer.from('x'));
    await expect(files.get('ws-2', entry.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.content('ws-2', entry.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.remove('ws-2', entry.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rows).toHaveLength(1);
  });

  it('streams the content of a file', async () => {
    const { entry } = await files.upsert('ws-1', artem, 'Main.kt', Buffer.from('fun main() {}'));
    const { stream } = await files.content('ws-1', entry.id);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('fun main() {}');
  });

  it('removes the row and the stored object', async () => {
    const { entry } = await files.upsert('ws-1', artem, 'Main.kt', Buffer.from('x'));
    await files.remove('ws-1', entry.id);
    expect(prisma.rows).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it('lists the files of one workspace with display names', async () => {
    await files.upsert('ws-1', artem, 'b.txt', Buffer.from('b'));
    await files.upsert('ws-1', iryna, 'a.cpp', Buffer.from('a'));
    await files.upsert('ws-2', artem, 'other.txt', Buffer.from('o'));

    const list = await files.list('ws-1');
    expect(list.map((file) => [file.name, file.uploadedBy])).toEqual([
      ['a.cpp', 'Ірина'],
      ['b.txt', 'Артем'],
    ]);
  });
});
