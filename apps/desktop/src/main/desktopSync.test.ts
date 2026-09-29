import { SyncEngine, SyncStatus } from '@shelf/shared';
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonSnapshotStore } from './jsonSnapshotStore';
import { NodeLocalFolder } from './nodeLocalFolder';
import { FakeApi } from './test/fakeApi';

let root: string;
let folder: string;
let api: FakeApi;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'shelf-desktop-sync-'));
  folder = join(root, 'Shelf');
  await mkdir(folder);
  api = new FakeApi();
});
afterEach(() => rm(root, { recursive: true, force: true }));

const engine = () =>
  new SyncEngine({ localFolder: new NodeLocalFolder(folder), snapshotStore: new JsonSnapshotStore(join(root, 'snapshots')), api });

describe('SyncEngine on the real file system', () => {
  it('keeps the server time on downloaded files, so the next scan is IN_SYNC', async () => {
    const entry = await api.put('photo.jpg', 'jpg-bytes');
    await engine().synchronize();

    const info = await stat(join(folder, 'photo.jpg'));
    expect(Math.round(info.mtimeMs)).toBe(Date.parse(entry.modifiedAt));
    expect((await engine().scan()).map((item) => item.status)).toEqual([SyncStatus.IN_SYNC]);
  });

  it('detects a conflict after edits on both sides', async () => {
    await writeFile(join(folder, 'todo.txt'), 'v1');
    await engine().synchronize();

    await api.put('todo.txt', 'server edit');
    await writeFile(join(folder, 'todo.txt'), 'local edit');
    const later = new Date(Date.now() + 60_000);
    await utimes(join(folder, 'todo.txt'), later, later);

    expect((await engine().scan()).map((item) => item.status)).toEqual([SyncStatus.CONFLICT]);
  });
});
