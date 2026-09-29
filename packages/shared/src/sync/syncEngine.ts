import type { FileApiClient } from '../fileApiClient';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../limits';
import { Side, SyncStatus } from '../types';
import { isSyncableName } from './fileNames';
import type { LocalFolder } from './localFolder';
import { putEntry, removeEntry, type SnapshotStore, type SyncSnapshot } from './snapshot';
import { buildItems, decideDirection, needsChecksum, type SyncItem } from './syncPlanner';

export type SyncApi = Pick<FileApiClient, 'listFiles' | 'upload' | 'download'>;

export type SyncReport = { uploaded: number; downloaded: number; skipped: number; conflicts: number; errors: string[] };

export type SyncProgress = { done: number; total: number; name: string };

export type SyncEngineDeps = {
  localFolder: LocalFolder;
  snapshotStore: SnapshotStore;
  api: SyncApi;
  now?: () => Date;
};

/** Platform-independent synchronization of one local folder with the user's workspace (spec §5). */
export class SyncEngine {
  private items: SyncItem[] = [];
  private snapshot: SyncSnapshot | null = null;

  constructor(private readonly deps: SyncEngineDeps) {}

  /** Builds the plan: one SyncItem per file name, with its status. */
  async scan(): Promise<SyncItem[]> {
    const { localFolder, snapshotStore, api } = this.deps;
    const [snapshot, local, remote] = await Promise.all([
      snapshotStore.load(localFolder.path),
      localFolder.listFiles(),
      api.listFiles(),
    ]);
    const localFiles = local.filter((file) => isSyncableName(file.name));
    const remoteByName = new Map(remote.map((file) => [file.name, file]));

    const checksums: Record<string, string> = {};
    for (const file of localFiles) {
      const input = { local: file, remote: remoteByName.get(file.name), snapshot: snapshot.entries[file.name] };
      if (needsChecksum(input)) checksums[file.name] = await localFolder.checksum(file.name);
    }

    this.snapshot = snapshot;
    this.items = buildItems(localFiles, remote, snapshot, checksums);
    return this.items.map((item) => ({ ...item }));
  }

  conflicts(): SyncItem[] {
    return this.items.filter((item) => item.status === SyncStatus.CONFLICT).map((item) => ({ ...item }));
  }

  /** Records the user's choice for a conflicting file. */
  resolve(name: string, keep: Side): void {
    const item = this.items.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`Файл «${name}» відсутній у плані синхронізації`);
    if (item.status !== SyncStatus.CONFLICT) throw new Error(`Файл «${name}» не перебуває в конфлікті`);
    item.resolution = keep;
  }

  /** Executes the plan. A failing file is reported and skipped; the rest are transferred. */
  async synchronize(onProgress?: (progress: SyncProgress) => void): Promise<SyncReport> {
    if (!this.snapshot) await this.scan();
    const snapshot = this.snapshot as SyncSnapshot;
    const report: SyncReport = { uploaded: 0, downloaded: 0, skipped: 0, conflicts: 0, errors: [] };
    const total = this.items.length;
    let done = 0;

    for (const item of this.items) {
      if (item.status === SyncStatus.CONFLICT) report.conflicts += 1;
      try {
        const side = decideDirection(item);
        if (side === Side.LOCAL) {
          await this.upload(item, snapshot);
          report.uploaded += 1;
        } else if (side === Side.REMOTE) {
          await this.download(item, snapshot);
          report.downloaded += 1;
        } else {
          this.recordInSync(item, snapshot);
          report.skipped += 1;
        }
      } catch (error) {
        report.errors.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      done += 1;
      onProgress?.({ done, total, name: item.name });
    }

    const present = new Set(this.items.map((item) => item.name));
    for (const name of Object.keys(snapshot.entries)) if (!present.has(name)) removeEntry(snapshot, name);
    snapshot.syncedAt = (this.deps.now ?? (() => new Date()))().toISOString();
    await this.deps.snapshotStore.save(snapshot);

    this.items = [];
    this.snapshot = null;
    return report;
  }

  private async upload(item: SyncItem, snapshot: SyncSnapshot): Promise<void> {
    const local = item.local;
    if (!local) throw new Error('немає локального файлу');
    if (local.size > MAX_UPLOAD_BYTES) throw new Error(`розмір перевищує ${MAX_UPLOAD_MB} МБ`);
    const bytes = await this.deps.localFolder.read(item.name);
    const { entry } = await this.deps.api.upload(item.name, bytes);
    putEntry(snapshot, {
      name: item.name,
      localModifiedAt: local.modifiedAt,
      localSize: local.size,
      remoteModifiedAt: entry.modifiedAt,
      checksum: entry.checksum,
    });
  }

  private async download(item: SyncItem, snapshot: SyncSnapshot): Promise<void> {
    const remote = item.remote;
    if (!remote) throw new Error('немає файлу на сервері');
    const blob = await this.deps.api.download(remote.id);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const written = await this.deps.localFolder.write(item.name, bytes, new Date(remote.modifiedAt));
    putEntry(snapshot, {
      name: item.name,
      localModifiedAt: written.modifiedAt,
      localSize: written.size,
      remoteModifiedAt: remote.modifiedAt,
      checksum: remote.checksum,
    });
  }

  private recordInSync(item: SyncItem, snapshot: SyncSnapshot): void {
    if (!item.local || !item.remote) return;
    putEntry(snapshot, {
      name: item.name,
      localModifiedAt: item.local.modifiedAt,
      localSize: item.local.size,
      remoteModifiedAt: item.remote.modifiedAt,
      checksum: item.remote.checksum,
    });
  }
}
