import type { Side } from '@shelf/shared';
import { dialog, ipcMain, type BrowserWindow, type NativeImage } from 'electron';
import { IPC, type SyncSession, type TransferFile } from '../shared/ipc';
import type { FileTransfers } from './fileTransfers';
import type { SettingsStore } from './settings';
import type { SyncService } from './syncService';

type IpcDeps = { settings: SettingsStore; sync: SyncService; transfers: FileTransfers; dragIcon: NativeImage };

export function registerIpc(window: BrowserWindow, deps: IpcDeps): () => void {
  const { settings, sync, transfers } = deps;

  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsSetServer, (_event, url: unknown) =>
    settings.update({ serverUrl: String(url ?? '').trim() || settings.get().serverUrl }),
  );
  ipcMain.handle(IPC.sessionSet, (_event, session: SyncSession | null) => sync.setSession(session));
  ipcMain.handle(IPC.folderChoose, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Оберіть папку для синхронізації',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return settings.get();
    return sync.bindFolder(result.filePaths[0]);
  });
  ipcMain.handle(IPC.syncScan, () => sync.scan());
  ipcMain.handle(IPC.syncRun, (_event, resolutions: Record<string, Side> | undefined) => sync.run(resolutions ?? {}));
  ipcMain.handle(IPC.syncCancel, () => sync.cancel());
  ipcMain.handle(IPC.syncSetWatch, (_event, enabled: unknown) => sync.setWatch(enabled === true));
  ipcMain.handle(IPC.fileSaveAs, (_event, file: TransferFile) => transfers.saveAs(window, file));
  ipcMain.handle(IPC.filePrepareDrag, async (_event, file: TransferFile) => {
    await transfers.prepareDrag(file);
  });
  ipcMain.on(IPC.fileStartDrag, (event, file: TransferFile) => {
    transfers.startDrag(event.sender, file, deps.dragIcon).catch(() => undefined);
  });

  const handled = [
    IPC.settingsGet,
    IPC.settingsSetServer,
    IPC.sessionSet,
    IPC.folderChoose,
    IPC.syncScan,
    IPC.syncRun,
    IPC.syncCancel,
    IPC.syncSetWatch,
    IPC.fileSaveAs,
    IPC.filePrepareDrag,
  ];
  return () => {
    for (const channel of handled) ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(IPC.fileStartDrag);
  };
}
