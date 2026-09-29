import { emptySnapshot, type SyncSnapshot } from '@shelf/shared';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonSnapshotStore } from './jsonSnapshotStore';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelf-snapshots-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const sample = (folderPath: string): SyncSnapshot => ({
  folderPath,
  syncedAt: '2026-09-29T10:00:00.000Z',
  entries: {
    'Main.kt': { name: 'Main.kt', localModifiedAt: 1, localSize: 2, remoteModifiedAt: '2026-09-29T09:00:00.000Z', checksum: 'c' },
  },
});

describe('JsonSnapshotStore', () => {
  it('returns an empty snapshot for a folder that was never synchronized', async () => {
    expect(await new JsonSnapshotStore(dir).load('/Users/artem/Shelf')).toEqual(emptySnapshot('/Users/artem/Shelf'));
  });

  it('saves and loads a snapshot', async () => {
    const store = new JsonSnapshotStore(join(dir, 'nested'));
    await store.save(sample('/Users/artem/Shelf'));
    expect(await store.load('/Users/artem/Shelf')).toEqual(sample('/Users/artem/Shelf'));
  });

  it('keeps one snapshot per folder', async () => {
    const store = new JsonSnapshotStore(dir);
    await store.save(sample('/a'));
    await store.save(sample('/b'));
    expect(await store.load('/a')).toEqual(sample('/a'));
    expect(await store.load('/b')).toEqual(sample('/b'));
    expect(await store.load('/c')).toEqual(emptySnapshot('/c'));
  });

  it('treats a corrupted file as "never synchronized"', async () => {
    const store = new JsonSnapshotStore(dir);
    await writeFile(store.fileFor('/a'), '{ broken');
    expect(await store.load('/a')).toEqual(emptySnapshot('/a'));
  });
});
