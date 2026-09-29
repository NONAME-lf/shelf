import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../hash';
import { extensionOf } from '../fileListOperations';
import type { UploadResult } from '../fileApiClient';
import { MAX_UPLOAD_BYTES } from '../limits';
import { T0 } from '../test/fixtures';
import { Side, SyncStatus, type FileEntryDto } from '../types';
import { MemoryLocalFolder } from './localFolder';
import { MemorySnapshotStore } from './snapshot';
import { SyncEngine, type SyncApi } from './syncEngine';
import { defaultSide } from './syncPlanner';

const MINUTE = 60_000;
const FOLDER = '/home/artem/shelf';

/** An in-memory server with the same "same name = new version" rule as the real API. */
class FakeServer implements SyncApi {
  readonly files = new Map<string, { entry: FileEntryDto; bytes: Uint8Array }>();
  readonly failUploadFor = new Set<string>();
  readonly failDownloadFor = new Set<string>();
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
    if (this.failDownloadFor.has(file.entry.name)) throw new Error('network down');
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
    folder.setFile('todo.txt', 'local edit, made later', T0 + 90 * MINUTE);

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
    folder.setFile('todo.txt', 'local edit, made later', T0 + 90 * MINUTE);

    const sync = engine();
    await sync.scan();
    sync.resolve('todo.txt', Side.REMOTE);
    expect(await sync.synchronize()).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: 1 });
    expect(folder.text('todo.txt')).toBe('server edit');
  });

  it("the user's choice of LOCAL overrides the newer server version", async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();
    folder.setFile('todo.txt', 'local edit, made earlier', T0 + 5 * MINUTE);
    await server.put('todo.txt', 'server edit');

    const sync = engine();
    const [conflict] = await sync.scan();
    expect(conflict.status).toBe(SyncStatus.CONFLICT);
    expect(defaultSide(conflict)).toBe(Side.REMOTE);
    sync.resolve('todo.txt', Side.LOCAL);
    expect(await sync.synchronize()).toMatchObject({ uploaded: 1, downloaded: 0, conflicts: 1 });
    expect(server.text('todo.txt')).toBe('local edit, made earlier');
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

  it('a failed download leaves the local file and its snapshot entry as they were', async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();
    const entryBefore = structuredClone(store.peek(FOLDER)?.entries['todo.txt']);
    await server.put('todo.txt', 'server edit');
    server.failDownloadFor.add('todo.txt');

    const report = await engine().synchronize();
    expect(report).toMatchObject({ downloaded: 0, errors: ['todo.txt: network down'] });
    expect(folder.text('todo.txt')).toBe('v1');
    expect(store.peek(FOLDER)?.entries['todo.txt']).toEqual(entryBefore);
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

  it('ignores a file named __proto__', async () => {
    folder.setFile('__proto__', 'x', T0);
    await server.put('__proto__', 'y');
    expect(await engine().scan()).toEqual([]);
  });

  it('compares a file named like a built-in object key by checksum on the first sync', async () => {
    folder.setFile('constructor', 'mine', T0);
    await server.put('constructor', 'theirs');
    expect(statuses(await engine().scan())).toEqual({ constructor: SyncStatus.CONFLICT });
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

describe('SyncEngine — names that differ only in letter case', () => {
  const collision = (name: string) => `«${name}»: назви відрізняються лише регістром — пропущено`;

  it('leaves such names out of the plan and reports each of them', async () => {
    folder.setFile('Main.kt', 'local', T0);
    folder.setFile('notes.txt', 'notes', T0);
    await server.put('main.kt', 'server');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'notes.txt': SyncStatus.LOCAL_ONLY });
    const report = await sync.synchronize();
    expect(report).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(report.errors).toEqual([collision('Main.kt'), collision('main.kt')]);
    expect(server.text('Main.kt')).toBeUndefined();
    expect(folder.has('main.kt')).toBe(false);
  });

  it('does not download two server files that would be one file locally', async () => {
    await server.put('Report.txt', 'first');
    await server.put('report.txt', 'second');

    const report = await engine().synchronize();
    expect(report).toMatchObject({ downloaded: 0, errors: [collision('Report.txt'), collision('report.txt')] });
    expect(folder.has('Report.txt') || folder.has('report.txt')).toBe(false);
  });

  it('keeps the snapshot entry of a skipped name', async () => {
    folder.setFile('Main.kt', 'v1', T0);
    await engine().synchronize();
    const entryBefore = structuredClone(store.peek(FOLDER)?.entries['Main.kt']);
    await server.put('main.kt', 'someone else');

    await engine().synchronize();
    expect(store.peek(FOLDER)?.entries['Main.kt']).toEqual(entryBefore);
  });

  it('does not download a name whose case variant was created locally after the scan', async () => {
    await server.put('Main.kt', 'server');

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'Main.kt': SyncStatus.REMOTE_ONLY });
    folder.setFile('main.kt', 'created while the dialog was open', T0 + 90 * MINUTE);

    const report = await sync.synchronize();
    expect(report).toMatchObject({ downloaded: 0 });
    expect(report.errors).toEqual(['«Main.kt»: файл змінився після перевірки — запустіть синхронізацію ще раз']);
    expect(folder.has('Main.kt')).toBe(false);
  });
});

describe('SyncEngine — a snapshot entry belongs to one server file', () => {
  it('records the server file id after an upload, a download and an in-sync check', async () => {
    folder.setFile('Main.kt', 'uploaded', T0);
    const photo = await server.put('photo.jpg', 'downloaded');
    folder.setFile('same.txt', 'identical', T0);
    const same = await server.put('same.txt', 'identical');

    await engine().synchronize();
    const entries = store.peek(FOLDER)?.entries ?? {};
    expect(entries['Main.kt']?.remoteId).toBe(server.files.get('Main.kt')?.entry.id);
    expect(entries['photo.jpg']?.remoteId).toBe(photo.id);
    expect(entries['same.txt']?.remoteId).toBe(same.id);
  });

  it('treats a different server file under a known name as a conflict, not as a newer version', async () => {
    folder.setFile('todo.txt', 'mine', T0);
    await engine().synchronize();
    server.delete('todo.txt');
    await server.put('todo.txt', 'a file of another account');

    expect(statuses(await engine().scan())).toEqual({ 'todo.txt': SyncStatus.CONFLICT });
  });
});

describe('SyncEngine — failures around the run', () => {
  it('forgets the plan when saving the snapshot fails', async () => {
    folder.setFile('todo.txt', 'v1', T0);
    await engine().synchronize();
    await server.put('todo.txt', 'server edit');
    folder.setFile('todo.txt', 'local edit', T0 + 90 * MINUTE);

    const sync = engine();
    expect(statuses(await sync.scan())).toEqual({ 'todo.txt': SyncStatus.CONFLICT });
    vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(sync.synchronize()).rejects.toThrow('disk full');
    expect(sync.conflicts()).toEqual([]);

    folder.setFile('new.txt', 'added after the failure', T0);
    await sync.synchronize();
    expect(server.text('new.txt')).toBe('added after the failure');
  });

  it('finishes the run when the progress callback throws', async () => {
    folder.setFile('a.txt', 'a', T0);
    folder.setFile('b.txt', 'b', T0);

    const report = await engine().synchronize(() => {
      throw new Error('window closed');
    });
    expect(report).toMatchObject({ uploaded: 2, errors: [] });
    expect(Object.keys(store.peek(FOLDER)?.entries ?? {}).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
