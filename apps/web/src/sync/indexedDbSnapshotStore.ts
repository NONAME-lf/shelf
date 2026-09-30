import { emptySnapshot, type SnapshotStore, type SyncSnapshot } from '@shelf/shared';
import { inStore, SNAPSHOTS, type OpenDb } from './idb';

function isSnapshotOf(value: unknown, folderPath: string): value is SyncSnapshot {
  const candidate = value as Partial<SyncSnapshot> | undefined;
  return candidate?.folderPath === folderPath && typeof candidate.entries === 'object' && candidate.entries !== null;
}

/**
 * One snapshot per bound folder in IndexedDB (spec §7.5), keyed by `BrowserLocalFolder.path` — the binding
 * id. A record of the wrong shape means "never synchronized", as a broken JSON file does on the desktop.
 */
export class IndexedDbSnapshotStore implements SnapshotStore {
  constructor(private readonly open: OpenDb) {}

  async load(folderPath: string): Promise<SyncSnapshot> {
    const stored = await inStore<unknown>(this.open, SNAPSHOTS, 'readonly', (store) => store.get(folderPath));
    return isSnapshotOf(stored, folderPath) ? stored : emptySnapshot(folderPath);
  }

  async save(snapshot: SyncSnapshot): Promise<void> {
    await inStore(this.open, SNAPSHOTS, 'readwrite', (store) => store.put(snapshot));
  }
}
