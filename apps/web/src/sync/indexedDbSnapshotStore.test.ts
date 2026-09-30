import { emptySnapshot, getEntry, type SyncSnapshot } from '@shelf/shared';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { inStore, shelfDb, SNAPSHOTS } from './idb';
import { IndexedDbSnapshotStore } from './indexedDbSnapshotStore';

const entry = (name: string) => ({
  name,
  localModifiedAt: 1_790_000_000_000,
  localSize: 3,
  remoteModifiedAt: '2026-09-20T09:01:00.000Z',
  checksum: 'c'.repeat(64),
  remoteId: `srv-${name}`,
});

const snapshotOf = (folderPath: string, ...names: string[]): SyncSnapshot => ({
  folderPath,
  syncedAt: '2026-09-30T12:00:00.000Z',
  entries: Object.fromEntries(names.map((name) => [name, entry(name)])),
});

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

describe('IndexedDbSnapshotStore', () => {
  it('returns an empty snapshot for a folder never synchronized', async () => {
    expect(await new IndexedDbSnapshotStore(shelfDb(factory)).load('binding-1')).toEqual(emptySnapshot('binding-1'));
  });

  it('keeps one snapshot per folder, also for the next page load', async () => {
    const store = new IndexedDbSnapshotStore(shelfDb(factory));
    await store.save(snapshotOf('binding-1', 'Main.kt'));
    await store.save(snapshotOf('binding-2', 'photo.jpg'));

    const reopened = new IndexedDbSnapshotStore(shelfDb(factory));
    expect(await reopened.load('binding-1')).toEqual(snapshotOf('binding-1', 'Main.kt'));
    expect(await reopened.load('binding-2')).toEqual(snapshotOf('binding-2', 'photo.jpg'));
  });

  it('keeps entries named like Object.prototype members as own entries', async () => {
    const store = new IndexedDbSnapshotStore(shelfDb(factory));
    await store.save(snapshotOf('binding-1', 'constructor', 'toString'));
    const loaded = await store.load('binding-1');
    expect(getEntry(loaded, 'constructor')).toEqual(entry('constructor'));
    expect(getEntry(loaded, 'valueOf')).toBeUndefined();
  });

  it('treats a record of the wrong shape as never synchronized', async () => {
    const open = shelfDb(factory);
    await inStore(open, SNAPSHOTS, 'readwrite', (store) => store.put({ folderPath: 'binding-1', entries: null }));
    expect(await new IndexedDbSnapshotStore(open).load('binding-1')).toEqual(emptySnapshot('binding-1'));
  });
});
