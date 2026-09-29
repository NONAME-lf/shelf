import type { FileEntryDto, Side, SyncItem, SyncProgress, SyncReport } from '@shelf/shared';

export const IPC = {
  settingsGet: 'settings:get',
  settingsSetServer: 'settings:set-server',
  sessionSet: 'session:set',
  folderChoose: 'folder:choose',
  syncScan: 'sync:scan',
  syncRun: 'sync:run',
  syncCancel: 'sync:cancel',
  syncSetWatch: 'sync:set-watch',
  syncProgress: 'sync:progress',
  syncAuto: 'sync:auto',
  fileSaveAs: 'file:save-as',
  filePrepareDrag: 'file:prepare-drag',
  fileStartDrag: 'file:start-drag',
} as const;

/** The server address and the signed-in account's folder and tracking (none before login). */
export type DesktopSettings = { serverUrl: string; folderPath: string | null; watch: boolean };
/** The signed-in account: folder bindings are kept per server address and user id. */
export type SyncSession = { serverUrl: string; token: string; userId: string };
export type SyncRunResult = { report: SyncReport; syncedAt: string };
export type AutoSyncEvent = { report: SyncReport | null; error: string | null; syncedAt: string };
export type TransferFile = Pick<FileEntryDto, 'id' | 'name' | 'modifiedAt'>;

/** What the preload script exposes to the renderer as window.shelf. */
export interface ShelfBridge {
  getSettings(): Promise<DesktopSettings>;
  setServerUrl(url: string): Promise<DesktopSettings>;
  /** Signs the main process in or out; returns the settings of that account. */
  setSession(session: SyncSession | null): Promise<DesktopSettings>;
  chooseFolder(): Promise<DesktopSettings>;
  scan(): Promise<SyncItem[]>;
  run(resolutions: Record<string, Side>): Promise<SyncRunResult>;
  cancel(): Promise<void>;
  setWatch(enabled: boolean): Promise<DesktopSettings>;
  onProgress(listener: (progress: SyncProgress) => void): () => void;
  onAutoSync(listener: (event: AutoSyncEvent) => void): () => void;
  saveAs(file: TransferFile): Promise<boolean>;
  prepareDrag(file: TransferFile): Promise<void>;
  startDrag(file: TransferFile): Promise<void>;
}
