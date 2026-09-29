import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../hash';
import { extensionOf } from '../fileListOperations';
import type { UploadResult } from '../fileApiClient';
import { MAX_UPLOAD_BYTES } from '../limits';
import { T0 } from '../test/fixtures';
import { Side, SyncStatus, type FileEntryDto } from '../types';
import { MemoryLocalFolder } from './localFolder';
import { MemorySnapshotStore } from './snapshot';
import { SyncEngine, type SyncApi } from './syncEngine';

const MINUTE = 60_000;
const FOLDER = '/home/artem/shelf';

/** An in-memory server with the same "same name = new version" rule as the real API. */
class FakeServer implements SyncApi {
  readonly files = new Map<string, { entry: FileEntryDto; bytes: Uint8Array }>();
  readonly failUploadFor = new Set<string>();
  uploads = 0;
  private clock = T0 + 30 * MINUTE;
  private sequence = 0;

  async put(name: string, content: string | Uint8Array, by = 'Ірина'): Promise<FileEntryDto> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.clock += MINUTE;
    const now = new Date(this.clock).toISOString();
    const existing = this.files.get(name)?.entry;
    const entry: FileEntryDto = {
      id: existing?.id ?? `srv-${++this.sequence}`,
      name,
      extension: extensionOf(name),
      size: bytes.byteLength,
      checksum: await sha256Hex(bytes),
      createdAt: existing?.createdAt ?? now,
      modifiedAt: now,
      uploadedBy: existing?.uploadedBy ?? by,
      editedBy: by,
    };
    this.files.set(name, { entry, bytes });
    return entry;
  }

  delete(name: string): void {
    this.files.delete(name);
  }

  text(name: string): string | undefined {
    const file = this.files.get(name);
    return file ? new TextDecoder().decode(file.bytes) : undefined;
  }

  async listFiles(): Promise<FileEntryDto[]> {
    return [...this.files.values()].map((file) => ({ ...file.entry }));
  }

  async upload(name: string, data: Blob | Uint8Array): Promise<UploadResult> {
    if (this.failUploadFor.has(name)) throw new Error('network down');
    this.uploads += 1;
    const created = !this.files.has(name);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
    return { entry: await this.put(name, bytes, 'Артем'), created };
  }

  async download(id: string): Promise<Blob> {
    const file = [...this.files.values()].find((candidate) => candidate.entry.id === id);
    if (!file) throw new Error(`not found: ${id}`);
    return new Blob([new Uint8Array(file.bytes)]);
  }
}

let server: FakeServer;
let folder: MemoryLocalFolder;
let store: MemorySnapshotStore;
const engine = () => new SyncEngine({ localFolder: folder, snapshotStore: store, api: server });
const statuses = (items: { name: string; status: SyncStatus }[]) =>
  Object.fromEntries(items.map((item) => [item.name, item.status]));

beforeEach(() => {
  server = new FakeServer();
  folder = new MemoryLocalFolder({ path: FOLDER });
  store = new MemorySnapshotStore();
});

describe('SyncEngine', () => {
  it('first sync uploads local-only files and downloads remote-only files', async () => {
    folder.setFile('Main.kt', 'fun main() {}', T0);
    const photo = await server.put('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff]));

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.LOCAL_ONLY, 'photo.jpg': SyncStatus.REMOTE_ONLY });

    const report = await sync.synchronize();
    expect(report).toEqual({ uploaded: 1, downloaded: 1, skipped: 0, conflicts: 0, errors: [] });
    expect(server.text('Main.kt')).toBe('fun main() {}');
    expect(folder.has('photo.jpg')).toBe(true);
    const written = (await folder.listFiles()).find((file) => file.name === 'photo.jpg');
    expect(written?.modifiedAt).toBe(Date.parse(photo.modifiedAt));

    const snapshot = store.peek(FOLDER);
    expect(Object.keys(snapshot?.entries ?? {}).sort()).toEqual(['Main.kt', 'photo.jpg']);
    expect(snapshot?.syncedAt).not.toBeNull();
  });

  it('a second sync without changes transfers nothing', async () => {
    folder.setFile('Main.kt', 'fun main() {}', T0);
    await server.put('photo.jpg', 'jpg');
    await engine().synchronize();
    const uploadsBefore = server.uploads;

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.IN_SYNC, 'photo.jpg': SyncStatus.IN_SYNC });
    expect(await sync.synchronize()).toEqual({ uploaded: 0, downloaded: 0, skipped: 2, conflicts: 0, errors: [] });
    expect(server.uploads).toBe(uploadsBefore);
  });

  it('uploads a local edit (LOCAL_NEWER) and downloads a server edit (REMOTE_NEWER)', async () => {
    folder.setFile('Main.kt', 'v1', T0);
    await server.put('todo.txt', 'buy milk');
    await engine().synchronize();

    folder.setFile('Main.kt', 'v2 — changed locally', T0 + 5 * MINUTE);
    await server.put('todo.txt', 'buy milk and bread');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.LOCAL_NEWER, 'todo.txt': SyncStatus.REMOTE_NEWER });
    expect(await sync.synchronize()).toMatchObject({ uploaded: 1, downloaded: 1, errors: [] });
    expect(server.text('Main.kt')).toBe('v2 — changed locally');
    expect(folder.text('todo.txt')).toBe('buy milk and bread');
  });

  it('detects a conflict and by default keeps the newer version', async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();

    await server.put('todo.txt', 'server edit');
    folder.setFile('todo.txt', 'local edit, made later', Date.now());

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'todo.txt': SyncStatus.CONFLICT });
    expect(sync.conflicts().map((item) => item.name)).toEqual(['todo.txt']);
    expect(await sync.synchronize()).toMatchObject({ uploaded: 1, downloaded: 0, conflicts: 1 });
    expect(server.text('todo.txt')).toBe('local edit, made later');
  });

  it("applies the user's resolution of a conflict", async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();

    await server.put('todo.txt', 'server edit');
    folder.setFile('todo.txt', 'local edit, made later', Date.now());

    const sync = engine();
    await sync.scan();
    sync.resolve('todo.txt', Side.REMOTE);
    expect(await sync.synchronize()).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: 1 });
    expect(folder.text('todo.txt')).toBe('server edit');
  });

  it('first sync compares checksums when there is no snapshot', async () => {
    folder.setFile('same.txt', 'identical', T0);
    folder.setFile('different.txt', 'mine', T0);
    await server.put('same.txt', 'identical');
    await server.put('different.txt', 'theirs');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'different.txt': SyncStatus.CONFLICT, 'same.txt': SyncStatus.IN_SYNC });
    await sync.synchronize();
    expect(store.peek(FOLDER)?.entries['same.txt']).toBeDefined();
  });

  it('isolates a failed transfer', async () => {
    folder.setFile('a.txt', 'a', T0);
    folder.setFile('b.txt', 'b', T0);
    server.failUploadFor.add('b.txt');

    const report = await engine().synchronize();
    expect(report.uploaded).toBe(1);
    expect(report.errors).toEqual(['b.txt: network down']);
    expect(Object.keys(store.peek(FOLDER)?.entries ?? {})).toEqual(['a.txt']);

    server.failUploadFor.clear();
    const retry = engine();
    expect(statuses(await retry.scan())['b.txt']).toBe(SyncStatus.LOCAL_ONLY);
    expect(await retry.synchronize()).toMatchObject({ uploaded: 1, errors: [] });
  });

  it('reports files above 50 MB instead of uploading them', async () => {
    folder.setFile('huge.bin', new Uint8Array(MAX_UPLOAD_BYTES + 1), T0);
    folder.setFile('small.txt', 'ok', T0);

    const report = await engine().synchronize();
    expect(report.uploaded).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('huge.bin');
    expect(report.errors[0]).toContain('50 МБ');
    expect(server.files.has('huge.bin')).toBe(false);
  });

  it('ignores hidden files', async () => {
    folder.setFile('.DS_Store', 'junk', T0);
    expect(await engine().scan()).toEqual([]);
  });

  it('rejects resolving a file that is not in conflict', async () => {
    folder.setFile('Main.kt', 'x', T0);
    const sync = engine();
    await sync.scan();
    expect(() => sync.resolve('Main.kt', Side.REMOTE)).toThrow('Main.kt');
    expect(() => sync.resolve('missing.txt', Side.LOCAL)).toThrow('missing.txt');
  });

  it('works in a browser-like folder that cannot keep the server time', async () => {
    folder = new MemoryLocalFolder({ path: '/browser', keepModifiedAt: false, now: () => T0 + 99 * MINUTE });
    await server.put('photo.jpg', 'jpg');
    await engine().synchronize();

    expect(statuses(await engine().scan())).toEqual({ 'photo.jpg': SyncStatus.IN_SYNC });
  });

  it('does not propagate deletions: a file deleted on the server is uploaded again', async () => {
    folder.setFile('Main.kt', 'x', T0);
    await engine().synchronize();
    server.delete('Main.kt');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.LOCAL_ONLY });
    await sync.synchronize();
    expect(server.text('Main.kt')).toBe('x');
  });

  it('reports progress for every item', async () => {
    folder.setFile('a.txt', 'a', T0);
    folder.setFile('b.txt', 'b', T0);
    const progress: string[] = [];
    await engine().synchronize((p) => progress.push(`${p.done}/${p.total} ${p.name}`));
    expect(progress).toEqual(['1/2 a.txt', '2/2 b.txt']);
  });
});

describe('SyncEngine — the plan is re-checked before transfer', () => {
  const changedAfterScan = (name: string) => `«${name}»: файл змінився після перевірки — запустіть синхронізацію ще раз`;

  it('does not download over a local edit made after the scan', async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();
    await server.put('todo.txt', 'server edit');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'todo.txt': SyncStatus.REMOTE_NEWER });
    const entryBefore = structuredClone(store.peek(FOLDER)?.entries['todo.txt']);
    folder.setFile('todo.txt', 'edited while the dialog was open', T0 + 90 * MINUTE);

    const report = await sync.synchronize();
    expect(report).toMatchObject({ downloaded: 0, errors: [changedAfterScan('todo.txt')] });
    expect(folder.text('todo.txt')).toBe('edited while the dialog was open');
    expect(store.peek(FOLDER)?.entries['todo.txt']).toEqual(entryBefore);
    expect(statuses(await engine().scan())).toEqual({ 'todo.txt': SyncStatus.CONFLICT });
  });

  it('does not download over a file created locally after the scan', async () => {
    await server.put('photo.jpg', 'server photo');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'photo.jpg': SyncStatus.REMOTE_ONLY });
    folder.setFile('photo.jpg', 'my own photo', T0 + 90 * MINUTE);

    const report = await sync.synchronize();
    expect(report).toMatchObject({ downloaded: 0, errors: [changedAfterScan('photo.jpg')] });
    expect(folder.text('photo.jpg')).toBe('my own photo');
    expect(store.peek(FOLDER)?.entries['photo.jpg']).toBeUndefined();
  });

  it('does not upload over a server edit made after the scan', async () => {
    folder.setFile('Main.kt', 'v1', T0);
    await engine().synchronize();
    folder.setFile('Main.kt', 'v2 — changed locally', T0 + 5 * MINUTE);

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.LOCAL_NEWER });
    await server.put('Main.kt', 'server edit');

    const report = await sync.synchronize();
    expect(report).toMatchObject({ uploaded: 0, errors: [changedAfterScan('Main.kt')] });
    expect(server.text('Main.kt')).toBe('server edit');
  });

  it('still transfers the files that did not change', async () => {
    folder.setFile('a.txt', 'a', T0);
    await server.put('b.txt', 'b');

    const sync = engine();
    await sync.scan();
    folder.setFile('a.txt', 'a, edited', T0 + 90 * MINUTE);

    const report = await sync.synchronize();
    expect(report).toMatchObject({ uploaded: 0, downloaded: 1, errors: [changedAfterScan('a.txt')] });
    expect(folder.text('b.txt')).toBe('b');
  });
});
