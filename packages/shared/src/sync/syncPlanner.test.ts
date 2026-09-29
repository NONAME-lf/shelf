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

  it('IN_SYNC at exactly 2 seconds; a change beyond that', () => {
    const atBoundary = localFile('Main.kt', { modifiedAt: T0 + 2000 });
    const beyond = localFile('Main.kt', { modifiedAt: T0 + 2001 });
    expect(computeStatus({ local: atBoundary, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local: beyond, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.LOCAL_NEWER);
  });

  it('applies the same tolerance to the server time', () => {
    const shifted = (ms: number) => fileEntry('Main.kt', { modifiedAt: iso(T0 + ms) });
    expect(computeStatus({ local, remote: shifted(1500), snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local, remote: shifted(-2000), snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local, remote: shifted(2000), snapshot: snapshotEntry() })).toBe(SyncStatus.IN_SYNC);
    expect(computeStatus({ local, remote: shifted(2001), snapshot: snapshotEntry() })).toBe(SyncStatus.REMOTE_NEWER);
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

  it('counts an unreadable time as a change', () => {
    const unreadableRemote = fileEntry('Main.kt', { modifiedAt: 'not a date' });
    const unreadableLocal = localFile('Main.kt', { modifiedAt: Number.NaN });
    expect(computeStatus({ local, remote: unreadableRemote, snapshot: snapshotEntry() })).toBe(SyncStatus.REMOTE_NEWER);
    expect(computeStatus({ local: unreadableLocal, remote, snapshot: snapshotEntry() })).toBe(SyncStatus.LOCAL_NEWER);
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

  it('keeps the server version when both times are equal', () => {
    expect(defaultSide(conflict(T0, T0))).toBe(Side.REMOTE);
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

  it('does not mistake built-in object keys for a snapshot entry or a checksum', () => {
    const local = [localFile('constructor'), localFile('toString')];
    const remote = [fileEntry('constructor'), fileEntry('toString')];
    const [constructorItem] = buildItems(local.slice(0, 1), remote.slice(0, 1), emptySnapshot('/x'), { constructor: 'd'.repeat(64) });
    expect(constructorItem.status).toBe(SyncStatus.CONFLICT);
    expect(() => buildItems(local.slice(1), remote.slice(1), emptySnapshot('/x'), {})).toThrow('toString');
  });

  it('uses the supplied checksums when there is no snapshot entry', () => {
    const remote = fileEntry('todo.txt', { checksum: 'a'.repeat(64) });
    const [item] = buildItems([localFile('todo.txt')], [remote], emptySnapshot('/x'), { 'todo.txt': 'a'.repeat(64) });
    expect(item.status).toBe(SyncStatus.IN_SYNC);
  });
});
