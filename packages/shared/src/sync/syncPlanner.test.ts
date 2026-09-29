import { describe, expect, it } from 'vitest';
import { fileEntry, localFile, names, T0 } from '../test/fixtures';
import { Side, SyncStatus } from '../types';
import { emptySnapshot, type SnapshotEntry } from './snapshot';
import { buildItems, computeStatus, decideDirection, defaultSide, needsChecksum, type SyncItem } from './syncPlanner';

const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const snapshotEntry = (overrides: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
  name: 'Main.kt',
  localModifiedAt: T0,
  localSize: 10,
  remoteModifiedAt: iso(T0),
  checksum: 'c'.repeat(64),
  ...overrides,
});

describe('computeStatus — таблиця статусів §5.2', () => {
  const local = localFile('Main.kt');
  const remote = fileEntry('Main.kt');

  it('LOCAL_ONLY when the file exists only locally (even if the snapshot knew it)', () => {
    expect(computeStatus({ local })).toBe(SyncStatus.LOCAL_ONLY);
    expect(computeStatus({ local, snapshot: snapshotEntry() })).toBe(SyncStatus.LOCAL_ONLY);
  });

  it('REMOTE_ONLY when the file exists only on the server', () => {
    expect(computeStatus({ remote })).toBe(SyncStatus.REMOTE_ONLY);
  });

  it('IN_SYNC when nothing changed since the snapshot', () => {
    expect(computeStatus({ local, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
  });

  it('IN_SYNC when the times differ by less than 2 seconds', () => {
    const shifted = localFile('Main.kt', { modifiedAt: T0 + 1500 });
    expect(computeStatus({ local: shifted, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
  });

  it('LOCAL_NEWER when only the local time changed', () => {
    const edited = localFile('Main.kt', { modifiedAt: T0 + MINUTE });
    expect(computeStatus({ local: edited, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.LOCAL_NEWER);
  });

  it('LOCAL_NEWER when only the local size changed', () => {
    const resized = localFile('Main.kt', { size: 11 });
    expect(computeStatus({ local: resized, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.LOCAL_NEWER);
  });

  it('REMOTE_NEWER when only the server version changed', () => {
    const replaced = fileEntry('Main.kt', { modifiedAt: iso(T0 + MINUTE) });
    expect(computeStatus({ local, remote: replaced, snapshot: snapshotEntry() })).toBe(SyncStatus.REMOTE_NEWER);
  });

  it('CONFLICT when both sides changed since the snapshot', () => {
    const edited = localFile('Main.kt', { modifiedAt: T0 + MINUTE });
    const replaced = fileEntry('Main.kt', { modifiedAt: iso(T0 + 2 * MINUTE) });
    expect(computeStatus({ local: edited, remote: replaced, snapshot: snapshotEntry() })).toBe(SyncStatus.CONFLICT);
  });

  it('without a snapshot: equal checksums → IN_SYNC, different → CONFLICT', () => {
    expect(needsChecksum({ local, remote })).toBe(true);
    expect(computeStatus({ local, remote, localChecksum: remote.checksum })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local, remote, localChecksum: 'd'.repeat(64) })).toBe(SyncStatus.CONFLICT);
  });

  it('refuses to guess without a snapshot and without a checksum', () => {
    expect(() => computeStatus({ local, remote })).toThrow('Main.kt');
  });

  it('refuses an input with neither side', () => {
    expect(() => computeStatus({})).toThrow();
  });
});

describe('computeStatus — a snapshot entry of a different server file', () => {
  const local = localFile('Main.kt');
  const snapshot = snapshotEntry({ remoteId: 'srv-old' });
  const unrelated = fileEntry('Main.kt', { id: 'srv-new', modifiedAt: iso(T0 + MINUTE) });

  it('is ignored: the checksum decides, as on a first synchronization', () => {
    expect(needsChecksum({ local, remote: unrelated, snapshot })).toBe(true);
    expect(computeStatus({ local, remote: unrelated, snapshot, localChecksum: unrelated.checksum })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local, remote: unrelated, snapshot, localChecksum: 'd'.repeat(64) })).toBe(SyncStatus.CONFLICT);
    expect(() => computeStatus({ local, remote: unrelated, snapshot })).toThrow('Main.kt');
  });

  it('is trusted when it names the same server file, or no server file at all', () => {
    const sameFile = fileEntry('Main.kt', { id: 'srv-old', modifiedAt: iso(T0 + MINUTE) });
    expect(needsChecksum({ local, remote: sameFile, snapshot })).toBe(false);
    expect(computeStatus({ local, remote: sameFile, snapshot })).toBe(SyncStatus.REMOTE_NEWER);
    expect(computeStatus({ local, remote: unrelated, snapshot: snapshotEntry() })).toBe(SyncStatus.REMOTE_NEWER);
  });
});

describe('conflict side', () => {
  const conflict = (localTime: number, remoteTime: number, resolution?: Side): SyncItem => ({
    name: 'Main.kt',
    local: localFile('Main.kt', { modifiedAt: localTime }),
    remote: fileEntry('Main.kt', { modifiedAt: iso(remoteTime) }),
    status: SyncStatus.CONFLICT,
    resolution,
  });

  it('by default keeps the newer version', () => {
    expect(defaultSide(conflict(T0 + MINUTE, T0))).toBe(Side.LOCAL);
    expect(defaultSide(conflict(T0, T0 + MINUTE))).toBe(Side.REMOTE);
  });

  it("follows the user's choice", () => {
    expect(decideDirection(conflict(T0 + MINUTE, T0, Side.REMOTE))).toBe(Side.REMOTE);
  });

  it('maps the other statuses to a direction', () => {
    const item = (status: SyncStatus): SyncItem => ({ name: 'x', status });
    expect(decideDirection(item(SyncStatus.LOCAL_ONLY))).toBe(Side.LOCAL);
    expect(decideDirection(item(SyncStatus.LOCAL_NEWER))).toBe(Side.LOCAL);
    expect(decideDirection(item(SyncStatus.REMOTE_ONLY))).toBe(Side.REMOTE);
    expect(decideDirection(item(SyncStatus.REMOTE_NEWER))).toBe(Side.REMOTE);
    expect(decideDirection(item(SyncStatus.IN_SYNC))).toBeNull();
  });
});

describe('buildItems', () => {
  it('builds one item per name from both sides, sorted, skipping hidden files', () => {
    const snapshot = emptySnapshot('/tmp/shelf');
    snapshot.entries['Main.kt'] = snapshotEntry();
    const items = buildItems(
      [localFile('Main.kt'), localFile('.DS_Store'), localFile('notes.txt')],
      [fileEntry('Main.kt'), fileEntry('photo.jpg'), fileEntry('.hidden')],
      snapshot,
      {},
    );
    expect(names(items)).toEqual(['Main.kt', 'notes.txt', 'photo.jpg']);
    expect(items.map((item) => item.status)).toEqual([
      SyncStatus.IN_SYNC,
      SyncStatus.LOCAL_ONLY,
      SyncStatus.REMOTE_ONLY,
    ]);
  });

  it('uses the supplied checksums when there is no snapshot entry', () => {
    const remote = fileEntry('todo.txt', { checksum: 'a'.repeat(64) });
    const [item] = buildItems([localFile('todo.txt')], [remote], emptySnapshot('/x'), { 'todo.txt': 'a'.repeat(64) });
    expect(item.status).toBe(SyncStatus.IN_SYNC);
  });
});
