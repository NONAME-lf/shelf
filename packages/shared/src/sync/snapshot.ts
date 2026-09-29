/** What both sides looked like after the last successful transfer of one file. */
export type SnapshotEntry = {
  name: string;
  localModifiedAt: number;
  localSize: number;
  remoteModifiedAt: string;
  checksum: string;
  /** `FileEntryDto.id` of the server file it was synced with; absent in entries recorded before it existed. */
  remoteId?: string;
};

/** The state after the last successful synchronization of one folder. */
export type SyncSnapshot = {
  folderPath: string;
  syncedAt: string | null;
  entries: Record<string, SnapshotEntry>;
};

export interface SnapshotStore {
  load(folderPath: string): Promise<SyncSnapshot>;
  save(snapshot: SyncSnapshot): Promise<void>;
}

export function emptySnapshot(folderPath: string): SyncSnapshot {
  return { folderPath, syncedAt: null, entries: {} };
}

export function putEntry(snapshot: SyncSnapshot, entry: SnapshotEntry): void {
  snapshot.entries[entry.name] = entry;
}

export function removeEntry(snapshot: SyncSnapshot, name: string): void {
  delete snapshot.entries[name];
}

export class MemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, SyncSnapshot>();

  async load(folderPath: string): Promise<SyncSnapshot> {
    const stored = this.snapshots.get(folderPath);
    return stored ? structuredClone(stored) : emptySnapshot(folderPath);
  }

  async save(snapshot: SyncSnapshot): Promise<void> {
    this.snapshots.set(snapshot.folderPath, structuredClone(snapshot));
  }

  peek(folderPath: string): SyncSnapshot | undefined {
    return this.snapshots.get(folderPath);
  }
}
