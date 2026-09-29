import { describe, expect, it } from 'vitest';
import { T0 } from '../test/fixtures';
import { emptySnapshot, getEntry, putEntry, type SnapshotEntry } from './snapshot';

const entry = (name: string): SnapshotEntry => ({
  name,
  localModifiedAt: T0,
  localSize: 10,
  remoteModifiedAt: new Date(T0).toISOString(),
  checksum: 'c'.repeat(64),
});

describe('getEntry', () => {
  it('returns an entry that was put', () => {
    const snapshot = emptySnapshot('/tmp/shelf');
    putEntry(snapshot, entry('Main.kt'));
    expect(getEntry(snapshot, 'Main.kt')).toEqual(entry('Main.kt'));
    expect(getEntry(snapshot, 'notes.txt')).toBeUndefined();
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])('does not mistake the built-in key %s for an entry', (name) => {
    expect(getEntry(emptySnapshot('/tmp/shelf'), name)).toBeUndefined();
  });
});
