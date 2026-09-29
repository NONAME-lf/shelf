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

function start(): void {
  let window: BrowserWindow | null = null;

  // a second launch brings the running window forward instead of opening another copy
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  void app.whenReady().then(() => {
    const userData = app.getPath('userData');
    const settings = new SettingsStore(join(userData, 'settings.json'));
    const mainWindow = createWindow();
    window = mainWindow;
    const sync = new SyncService({
      settings,
      snapshotsDir: join(userData, 'snapshots'),
      send: (channel, payload) => {
        // the window may already be gone when a background run finishes
        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(channel, payload);
      },
    });
    const transfers = new FileTransfers(() => sync.requireApi(), join(app.getPath('temp'), 'shelf-drag'));
    const disposeIpc = registerIpc(mainWindow, { settings, sync, transfers, dragIcon: nativeImage.createFromPath(dragIconPath) });
    mainWindow.on('closed', disposeIpc);

    // The watcher and the drag-out temp files are cleaned up before the process exits: the first
    // will-quit is held until the cleanup is done, then quitting resumes and passes through.
    let cleanup: 'pending' | 'running' | 'done' = 'pending';
    app.on('will-quit', (event) => {
      if (cleanup === 'done') return;
      event.preventDefault();
      if (cleanup === 'running') return;
      cleanup = 'running';
      void Promise.allSettled([sync.dispose(), transfers.cleanup()]).then(() => {
        cleanup = 'done';
        app.quit();
      });
    });
  });

  app.on('window-all-closed', () => app.quit());
}

// One copy per profile: two copies would watch and synchronize the same folder at once.
if (app.requestSingleInstanceLock()) start();
else app.quit();
