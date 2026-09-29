import { FileApiClient, SyncEngine, type Side, type SyncApi, type SyncItem } from '@shelf/shared';
import { IPC, type AutoSyncEvent, type DesktopSettings, type SyncRunResult, type SyncSession } from '../shared/ipc';
import { FolderWatcher } from './folderWatcher';
import { JsonSnapshotStore } from './jsonSnapshotStore';
import { NodeLocalFolder } from './nodeLocalFolder';
import type { SettingsStore } from './settings';

type Closable = { close(): Promise<void>; ready?(): Promise<void> };

export type SyncServiceDeps = {
  settings: SettingsStore;
  snapshotsDir: string;
  send: (channel: string, payload: unknown) => void;
  createApi?: (session: SyncSession) => SyncApi;
  createWatcher?: (folderPath: string, onChange: () => void) => Closable;
  now?: () => Date;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const defaultApi = (session: SyncSession): SyncApi => new FileApiClient({ baseUrl: session.serverUrl, token: session.token });

/**
 * Synchronization in the main process (spec §5, §7.4). The renderer asks for scan(), shows the
 * ConflictDialog for CONFLICT items, then calls run(resolutions). The folder watcher calls autoSync(),
 * which keeps the newer version of a conflicting file without asking.
 */
export class SyncService {
  private session: SyncSession | null = null;
  private pending: SyncEngine | null = null;
  private busy = false;
  private rerun = false;
  private generation = 0;
  private watcher: Closable | null = null;

  constructor(private readonly deps: SyncServiceDeps) {}

  async setSession(session: SyncSession | null): Promise<void> {
    this.session = session;
    this.pending = null;
    this.generation++;
    await this.restartWatcher();
  }

  requireApi(): SyncApi {
    if (!this.session) throw new Error('Спочатку увійдіть до системи');
    return (this.deps.createApi ?? defaultApi)(this.session);
  }

  async bindFolder(folderPath: string): Promise<DesktopSettings> {
    const settings = this.deps.settings.update({ folderPath });
    this.pending = null;
    this.generation++;
    await this.restartWatcher();
    return settings;
  }

  async setWatch(enabled: boolean): Promise<DesktopSettings> {
    const settings = this.deps.settings.update({ watch: enabled });
    await this.restartWatcher();
    return settings;
  }

  async scan(): Promise<SyncItem[]> {
    this.ensureIdle();
    this.busy = true;
    const generation = this.generation;
    try {
      const engine = this.createEngine();
      const items = await engine.scan();
      // the folder or the session changed while scanning: this plan belongs to the old one
      if (generation === this.generation) this.pending = engine;
      return items;
    } finally {
      this.busy = false;
    }
  }

  async run(resolutions: Record<string, Side>): Promise<SyncRunResult> {
    this.ensureIdle();
    this.busy = true;
    try {
      let engine = this.pending;
      this.pending = null;
      if (!engine) {
        engine = this.createEngine();
        // synchronize() plans by itself; a separate scan is only needed to accept resolutions
        if (Object.keys(resolutions).length > 0) await engine.scan();
      }
      for (const [name, side] of Object.entries(resolutions)) engine.resolve(name, side);
      const report = await engine.synchronize((progress) => this.deps.send(IPC.syncProgress, progress));
      return { report, syncedAt: this.now().toISOString() };
    } finally {
      this.busy = false;
      this.runPendingRerun();
    }
  }

  cancel(): void {
    this.pending = null;
    this.runPendingRerun();
  }

  async autoSync(): Promise<void> {
    if (!this.session || !this.deps.settings.get().folderPath) return;
    if (this.busy || this.pending) {
      // a change during a running operation or an open conflict dialog: one follow-up run afterwards
      this.rerun = true;
      return;
    }
    this.busy = true;
    let event: AutoSyncEvent;
    try {
      const report = await this.createEngine().synchronize();
      event = { report, error: null, syncedAt: this.now().toISOString() };
    } catch (error) {
      event = { report: null, error: messageOf(error), syncedAt: this.now().toISOString() };
    } finally {
      this.busy = false;
    }
    this.deps.send(IPC.syncAuto, event);
    this.runPendingRerun();
  }

  async dispose(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  private createEngine(): SyncEngine {
    const folderPath = this.deps.settings.get().folderPath;
    if (!folderPath) throw new Error('Спочатку оберіть локальну папку');
    return new SyncEngine({
      localFolder: new NodeLocalFolder(folderPath),
      snapshotStore: new JsonSnapshotStore(this.deps.snapshotsDir),
      api: this.requireApi(),
    });
  }

  private runPendingRerun(): void {
    if (!this.rerun) return;
    this.rerun = false;
    void this.autoSync();
  }

  private ensureIdle(): void {
    if (this.busy) throw new Error('Синхронізація вже виконується');
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private async restartWatcher(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    const { watch, folderPath } = this.deps.settings.get();
    if (!watch || !folderPath || !this.session) return;
    const create = this.deps.createWatcher ?? ((path: string, onChange: () => void) => new FolderWatcher(path, onChange));
    this.watcher = create(folderPath, () => void this.autoSync());
    await this.watcher.ready?.();
  }
}
