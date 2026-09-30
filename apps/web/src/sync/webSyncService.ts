import {
  SyncEngine,
  type LocalFile,
  type LocalFolder,
  type Side,
  type SnapshotStore,
  type SyncApi,
  type SyncItem,
  type SyncProgress,
  type SyncReport,
} from '@shelf/shared';
import { BrowserLocalFolder } from './browserLocalFolder';
import { explainBrowserError, explainPickerError, isAbortError } from './browserErrors';
import { hasFolderPermission } from './fileSystemAccess';
import type { FolderBinding, FolderBindings } from './folderBindingStore';

/** The signed-in account: its key (`accountKey` from `@shelf/shared`) and the client that talks to its space. */
export type WebSyncSession = { account: string; api: SyncApi };
/** What the sidebar shows: the bound folder's name (a page never learns the full path) and tracking. */
export type WebSyncState = { folderName: string | null; watch: boolean };
export type SyncRunResult = { report: SyncReport; syncedAt: string };
export type AutoSyncEvent = { report: SyncReport | null; error: string | null; syncedAt: string };

export const POLL_INTERVAL_MS = 5000;

export type WebSyncServiceDeps = {
  bindings: FolderBindings;
  snapshots: SnapshotStore;
  /** `showDirectoryPicker({ mode: 'readwrite' })`; rejects with an AbortError when the user closes it. */
  pickFolder: () => Promise<FileSystemDirectoryHandle>;
  onAutoSync: (event: AutoSyncEvent) => void;
  onProgress?: (progress: SyncProgress) => void;
  /** Calls `tick` at once and then every `ms`; returns the function that stops it. */
  every?: (ms: number, tick: () => Promise<void>) => () => void;
  isVisible?: () => boolean;
  newId?: () => string;
  now?: () => Date;
};

/** The production scheduler: a tick right away (tracking starts with one run), then every `ms`. */
export function everyInterval(ms: number, tick: () => Promise<void>): () => void {
  void tick();
  const timer = setInterval(() => void tick(), ms);
  return () => clearInterval(timer);
}

const pageIsVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Names, sizes and modification times: what a poll compares to notice a change in the folder. */
function listingOf(files: LocalFile[]): string {
  const rows = files.map((file) => [file.name, file.size, file.modifiedAt] as const);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows);
}

export const permissionMessage = (folder: string) =>
  `Немає доступу до папки «${folder}». Натисніть «Синхронізувати» і дозвольте доступ — після цього зміни відстежуватимуться автоматично.`;

/**
 * Synchronization in the browser (spec §5, §7.5), the web counterpart of the desktop SyncService. The page
 * asks for scan(), shows the ConflictDialog for CONFLICT items, then calls run(resolutions). A browser has
 * no reliable change events, so automatic tracking polls the folder listing every 5 s while the tab is
 * visible and synchronizes — keeping the newer version of a conflicting file — only when the listing
 * changed. The folder and tracking belong to the signed-in account.
 */
export class WebSyncService {
  private session: WebSyncSession | null = null;
  private binding: FolderBinding | null = null;
  private pending: SyncEngine | null = null;
  /** A manual scan or run is in progress; there is at most one at a time. */
  private manual = false;
  /** The automatic run in progress; a manual operation waits for it. */
  private automatic: Promise<void> | null = null;
  private rerun = false;
  private generation = 0;
  private stopPolling: (() => void) | null = null;
  private polling: Promise<void> | null = null;
  /** The listing the last poll saw; null makes the next poll synchronize. */
  private lastListing: string | null = null;
  /** The last error an automatic run reported; the same error is not repeated every 5 s. */
  private reported: string | null = null;

  constructor(private readonly deps: WebSyncServiceDeps) {}

  /** Signs in (the account's folder and tracking come back) or out (everything of the account stops). */
  async setSession(session: WebSyncSession | null): Promise<WebSyncState> {
    const generation = ++this.generation;
    this.session = session;
    this.binding = null;
    this.pending = null;
    // a change held back for the previous account must not run under the next one
    this.rerun = false;
    this.reported = null;
    this.restartPolling();
    if (session) {
      const binding = await this.deps.bindings.get(session.account);
      if (generation !== this.generation) return this.state();
      this.binding = binding;
      this.restartPolling();
    }
    return this.state();
  }

  state(): WebSyncState {
    return { folderName: this.binding?.handle.name ?? null, watch: this.binding?.watch ?? false };
  }

  /** «Обрати папку» / «Змінити». Closing the picker leaves everything as it was. */
  async chooseFolder(): Promise<WebSyncState> {
    const account = this.requireAccount();
    const current = this.binding;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await this.deps.pickFolder();
    } catch (error) {
      if (isAbortError(error)) return this.state();
      throw explainPickerError();
    }
    // signed out while the picker was open: the choice belongs to nobody now
    if (this.session?.account !== account) return this.state();
    // the same folder chosen again keeps its snapshot; another folder starts a new one
    let same = false;
    try {
      same = current ? await current.handle.isSameEntry(handle) : false;
    } catch (error) {
      throw explainBrowserError(error, current?.handle.name ?? null);
    }
    const binding: FolderBinding = {
      account,
      id: same && current ? current.id : (this.deps.newId ?? (() => crypto.randomUUID()))(),
      handle,
      watch: current?.watch ?? false,
    };
    await this.deps.bindings.put(binding);
    if (this.session?.account !== account) return this.state();
    this.binding = binding;
    this.pending = null;
    this.generation++;
    this.reported = null;
    this.restartPolling();
    return this.state();
  }

  async setWatch(enabled: boolean): Promise<WebSyncState> {
    this.requireAccount();
    const binding = this.binding;
    if (!binding) throw new Error('Спочатку оберіть локальну папку');
    const next: FolderBinding = { ...binding, watch: enabled };
    await this.deps.bindings.put(next);
    // the folder or the session changed meanwhile
    if (this.binding !== binding) return this.state();
    this.binding = next;
    this.restartPolling();
    return this.state();
  }

  async scan(): Promise<SyncItem[]> {
    this.beginManual();
    try {
      const generation = this.generation;
      // asks for the folder permission while the click still counts as a user gesture
      const engine = await this.createEngine();
      await this.automaticRunFinished();
      const items = await engine.scan();
      // the folder or the session changed meanwhile: this plan belongs to the old one
      if (generation === this.generation) this.pending = engine;
      return items;
    } finally {
      this.manual = false;
      this.runPendingRerun();
    }
  }

  async run(resolutions: Record<string, Side>): Promise<SyncRunResult> {
    this.beginManual();
    try {
      const planned = this.pending;
      this.pending = null;
      const engine = planned ?? (await this.createEngine());
      await this.automaticRunFinished();
      // synchronize() plans by itself; a separate scan is only needed to accept resolutions
      if (!planned && Object.keys(resolutions).length > 0) await engine.scan();
      for (const [name, side] of Object.entries(resolutions)) engine.resolve(name, side);
      const report = await engine.synchronize((progress) => this.deps.onProgress?.(progress));
      return { report, syncedAt: this.now().toISOString() };
    } finally {
      this.manual = false;
      this.runPendingRerun();
    }
  }

  /** Drops the scanned plan (dialog closed, logout, folder change) and lets automatic tracking resume. */
  cancel(): void {
    this.pending = null;
    this.runPendingRerun();
  }

  autoSync(): Promise<void> {
    if (!this.session || !this.binding?.watch) return Promise.resolve();
    if (this.manual || this.automatic || this.pending) {
      // a change during a running operation or an open conflict dialog: one follow-up run afterwards
      this.rerun = true;
      return Promise.resolve();
    }
    this.automatic = this.synchronizeAutomatically(this.session, this.binding).finally(() => {
      this.automatic = null;
      this.runPendingRerun();
    });
    return this.automatic;
  }

  /** One polling tick: synchronizes when the folder listing differs from the one the last tick saw. */
  poll(): Promise<void> {
    if (!this.polling) {
      const running: Promise<void> = this.pollOnce().finally(() => {
        // restartPolling may have replaced it with a poll of the new account or folder
        if (this.polling === running) this.polling = null;
      });
      this.polling = running;
    }
    return this.polling;
  }

  private async pollOnce(): Promise<void> {
    const binding = this.binding;
    if (!this.session || !binding?.watch || !(this.deps.isVisible ?? pageIsVisible)()) return;
    const generation = this.generation;
    let listing: string;
    try {
      if (!(await this.permitted(binding, false))) {
        this.report(generation, permissionMessage(binding.handle.name));
        return;
      }
      listing = listingOf(await this.folderOf(binding).listFiles());
    } catch (error) {
      this.report(generation, messageOf(explainBrowserError(error, null)));
      return;
    }
    if (generation !== this.generation || listing === this.lastListing) return;
    this.lastListing = listing;
    await this.autoSync();
  }

  private async synchronizeAutomatically(session: WebSyncSession, binding: FolderBinding): Promise<void> {
    const generation = this.generation;
    try {
      if (!(await this.permitted(binding, false))) {
        this.report(generation, permissionMessage(binding.handle.name));
        return;
      }
      const report = await this.engineFor(session, binding).synchronize();
      // after a logout or a folder change the page shows another account or folder
      if (generation === this.generation) {
        this.reported = null;
        this.deps.onAutoSync({ report, error: null, syncedAt: this.now().toISOString() });
      }
    } catch (error) {
      // the change is not lost: the next poll tries again (unless the account or folder changed meanwhile)
      if (generation === this.generation) this.lastListing = null;
      this.report(generation, messageOf(explainBrowserError(error, null)));
    }
  }

  private report(generation: number, error: string): void {
    if (generation !== this.generation || error === this.reported) return;
    this.reported = error;
    this.deps.onAutoSync({ report: null, error, syncedAt: this.now().toISOString() });
  }

  private restartPolling(): void {
    this.stopPolling?.();
    this.stopPolling = null;
    this.lastListing = null;
    // a poll still in flight belongs to the previous account or folder; the new poller's first tick must not reuse it
    this.polling = null;
    if (!this.session || !this.binding?.watch) return;
    this.stopPolling = (this.deps.every ?? everyInterval)(POLL_INTERVAL_MS, () => this.poll());
  }

  private requireAccount(): string {
    if (!this.session) throw new Error('Спочатку увійдіть до системи');
    return this.session.account;
  }

  /** The engine of a manual operation; asks for the folder permission when Chrome has forgotten it. */
  private async createEngine(): Promise<SyncEngine> {
    const session = this.session;
    if (!session) throw new Error('Спочатку увійдіть до системи');
    const binding = this.binding;
    if (!binding) throw new Error('Спочатку оберіть локальну папку');
    if (!(await this.permitted(binding, true))) throw new Error(`Доступ до папки «${binding.handle.name}» не надано`);
    this.reported = null;
    return this.engineFor(session, binding);
  }

  private engineFor(session: WebSyncSession, binding: FolderBinding): SyncEngine {
    return new SyncEngine({ localFolder: this.folderOf(binding), snapshotStore: this.deps.snapshots, api: session.api });
  }

  private folderOf(binding: FolderBinding): LocalFolder {
    return new BrowserLocalFolder(binding.handle, binding.id);
  }

  private permitted(binding: FolderBinding, ask: boolean): Promise<boolean> {
    return hasFolderPermission(binding.handle, ask);
  }

  private runPendingRerun(): void {
    if (!this.rerun) return;
    this.rerun = false;
    void this.autoSync();
  }

  private beginManual(): void {
    if (this.manual) throw new Error('Синхронізація вже виконується');
    this.manual = true;
  }

  /** «Синхронізувати» pressed during an automatic run waits for that run instead of failing. */
  private async automaticRunFinished(): Promise<void> {
    while (this.automatic) await this.automatic;
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }
}
