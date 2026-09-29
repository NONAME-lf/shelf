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

export type DesktopSettings = { serverUrl: string; folderPath: string | null; watch: boolean };
export type SyncSession = { serverUrl: string; token: string };
export type SyncRunResult = { report: SyncReport; syncedAt: string };
export type AutoSyncEvent = { report: SyncReport | null; error: string | null; syncedAt: string };
export type TransferFile = Pick<FileEntryDto, 'id' | 'name' | 'modifiedAt'>;

/** What the preload script exposes to the renderer as window.shelf. */
export interface ShelfBridge {
  getSettings(): Promise<DesktopSettings>;
  setServerUrl(url: string): Promise<DesktopSettings>;
  setSession(session: SyncSession | null): Promise<void>;
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
