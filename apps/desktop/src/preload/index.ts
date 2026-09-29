import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ShelfBridge } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: ShelfBridge = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setServerUrl: (url) => ipcRenderer.invoke(IPC.settingsSetServer, url),
  setSession: (session) => ipcRenderer.invoke(IPC.sessionSet, session),
  chooseFolder: () => ipcRenderer.invoke(IPC.folderChoose),
  scan: () => ipcRenderer.invoke(IPC.syncScan),
  run: (resolutions) => ipcRenderer.invoke(IPC.syncRun, resolutions),
  cancel: () => ipcRenderer.invoke(IPC.syncCancel),
  setWatch: (enabled) => ipcRenderer.invoke(IPC.syncSetWatch, enabled),
  onProgress: (listener) => subscribe(IPC.syncProgress, listener),
  onAutoSync: (listener) => subscribe(IPC.syncAuto, listener),
  saveAs: (file) => ipcRenderer.invoke(IPC.fileSaveAs, file),
  prepareDrag: (file) => ipcRenderer.invoke(IPC.filePrepareDrag, file),
  startDrag: (file) => ipcRenderer.invoke(IPC.fileStartDrag, file),
};

contextBridge.exposeInMainWorld('shelf', bridge);
