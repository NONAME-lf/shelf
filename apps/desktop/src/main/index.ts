import { app, BrowserWindow, nativeImage, shell } from 'electron';
import { join } from 'node:path';
import dragIconPath from '../../resources/drag.png?asset';
import { FileTransfers } from './fileTransfers';
import { registerIpc } from './ipc';
import { SettingsStore } from './settings';
import { SyncService } from './syncService';

// The UI scripts start the app with an isolated profile.
if (process.env.SHELF_USER_DATA) app.setPath('userData', process.env.SHELF_USER_DATA);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: 'Shelf',
    backgroundColor: '#f7f5f0',
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // the app is a single page: nothing may navigate the window away
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

void app.whenReady().then(() => {
  const userData = app.getPath('userData');
  const settings = new SettingsStore(join(userData, 'settings.json'));
  const window = createWindow();
  const sync = new SyncService({
    settings,
    snapshotsDir: join(userData, 'snapshots'),
    send: (channel, payload) => {
      // the window may already be gone when a background run finishes
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, payload);
    },
  });
  const transfers = new FileTransfers(() => sync.requireApi(), join(app.getPath('temp'), 'shelf-drag'));
  const disposeIpc = registerIpc(window, { settings, sync, transfers, dragIcon: nativeImage.createFromPath(dragIconPath) });

  window.on('closed', () => {
    disposeIpc();
    void sync.dispose();
    void transfers.cleanup();
  });
});

app.on('window-all-closed', () => app.quit());
