import { Side, SyncStatus } from '@shelf/shared';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../shared/ipc';
import { accountKey, SettingsStore } from './settings';
import { SyncService } from './syncService';
import { FakeApi } from './test/fakeApi';

const ARTEM = { serverUrl: 'http://localhost:4000', token: 'jwt-artem', userId: 'user-artem' };
const IRYNA = { serverUrl: 'http://localhost:4000', token: 'jwt-iryna', userId: 'user-iryna' };
const keyOf = (session: typeof ARTEM) => accountKey(session.serverUrl, session.userId);
let root: string;
let folder: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'shelf-sync-service-'));
  folder = join(root, 'Shelf');
  await mkdir(folder);
});
afterEach(() => rm(root, { recursive: true, force: true }));

/** Artem has `folder` bound; every account has its own in-memory server space. */
function setup({ watch = false } = {}) {
  const settings = new SettingsStore(join(root, 'settings.json'));
  settings.updateBinding(keyOf(ARTEM), { folderPath: folder, watch });
  const apis = new Map<string, FakeApi>();
  const apiOf = (userId: string) => apis.get(userId) ?? apis.set(userId, new FakeApi()).get(userId)!;
  const api = apiOf(ARTEM.userId);
  const sent: [string, unknown][] = [];
  const autoEvents = () => sent.filter(([channel]) => channel === IPC.syncAuto);
  const watchers: { path: string; onChange: () => void; closed: boolean; close: () => Promise<void> }[] = [];
  const service = new SyncService({
    settings,
    snapshotsDir: join(root, 'snapshots'),
    send: (channel, payload) => sent.push([channel, payload]),
    createApi: (session) => apiOf(session.userId),
    createWatcher: (path, onChange) => {
      const watcher = {
        path,
        onChange,
        closed: false,
        close: async () => {
          watcher.closed = true;
        },
      };
      watchers.push(watcher);
      return watcher;
    },
  });
  return { settings, api, apiOf, sent, autoEvents, watchers, service };
}

describe('SyncService', () => {
  it('scans and synchronizes the bound folder', async () => {
    await writeFile(join(folder, 'Main.kt'), 'fun main() {}');
    const { api, service, sent } = setup();
    await service.setSession(ARTEM);

    const items = await service.scan();
    expect(items.map((item) => [item.name, item.status])).toEqual([['Main.kt', SyncStatus.LOCAL_ONLY]]);
    const result = await service.run({});
    expect(result.report).toMatchObject({ uploaded: 1, errors: [] });
    expect(api.text('Main.kt')).toBe('fun main() {}');
    expect(sent.filter(([channel]) => channel === IPC.syncProgress)).toHaveLength(1);
  });

  it('applies the resolution chosen in the conflict dialog', async () => {
    await writeFile(join(folder, 'todo.txt'), 'v1');
    const { api, service } = setup();
    await service.setSession(ARTEM);
    await service.run({});

    await api.put('todo.txt', 'server edit');
    await writeFile(join(folder, 'todo.txt'), 'local edit, much later');
    const later = new Date(Date.now() + 60_000);
    await utimes(join(folder, 'todo.txt'), later, later);

    expect((await service.scan()).map((item) => item.status)).toEqual([SyncStatus.CONFLICT]);
    const result = await service.run({ 'todo.txt': Side.REMOTE });
    expect(result.report).toMatchObject({ downloaded: 1, conflicts: 1 });
    expect(await readFile(join(folder, 'todo.txt'), 'utf8')).toBe('server edit');
  });

  it('refuses to start a second operation while one is running', async () => {
    const { service } = setup();
    await service.setSession(ARTEM);
    const first = service.scan();
    await expect(service.run({})).rejects.toThrow('Синхронізація вже виконується');
    await first;
  });

  it('explains what is missing', async () => {
    const { settings, service } = setup();
    await expect(service.scan()).rejects.toThrow('Спочатку увійдіть до системи');
    await service.setSession(ARTEM);
    settings.updateBinding(keyOf(ARTEM), { folderPath: null });
    await expect(service.scan()).rejects.toThrow('Спочатку оберіть локальну папку');
  });

  it('watches the folder only when tracking is on, a folder is bound and a user is signed in', async () => {
    const { service, watchers, sent } = setup({ watch: true });
    expect(watchers).toHaveLength(0);
    await service.setSession(ARTEM);
    expect(watchers).toHaveLength(1);
    await mkdir(join(root, 'Other'));
    await service.scan();
    await service.bindFolder(join(root, 'Other'));
    expect(watchers[0].closed).toBe(true);
    expect(watchers).toHaveLength(2);
    expect(watchers[1].path).toBe(join(root, 'Other'));
    await service.setWatch(false);
    expect(watchers[1].closed).toBe(true);
    expect(watchers).toHaveLength(2);
    // the pending plan of the previous folder was dropped, so it does not block automatic runs
    await service.autoSync();
    expect(sent.filter(([channel]) => channel === IPC.syncAuto)).toHaveLength(1);
  });

  it('synchronizes automatically on a folder change and reports to the window', async () => {
    await writeFile(join(folder, 'auto.txt'), 'x');
    const { service, watchers, sent, api } = setup({ watch: true });
    await service.setSession(ARTEM);

    watchers[0].onChange();
    await vi.waitFor(() => expect(sent.some(([channel]) => channel === IPC.syncAuto)).toBe(true));
    const event = sent.find(([channel]) => channel === IPC.syncAuto)?.[1];
    expect(event).toMatchObject({ error: null, report: { uploaded: 1 } });
    expect(api.text('auto.txt')).toBe('x');
  });

  it('does not synchronize automatically while a conflict dialog is open', async () => {
    await writeFile(join(folder, 'draft.txt'), 'local');
    const { service, sent, api } = setup({ watch: true });
    await service.setSession(ARTEM);
    await service.scan();
    await service.autoSync();
    expect(sent.filter(([channel]) => channel === IPC.syncAuto)).toHaveLength(0);
    expect(api.text('draft.txt')).toBeUndefined();

    // cancelling the dialog resumes the automatic run that was held back
    service.cancel();
    await vi.waitFor(() => expect(sent.filter(([channel]) => channel === IPC.syncAuto)).toHaveLength(1));
    expect(api.text('draft.txt')).toBe('local');
  });

  it('runs one follow-up automatic run when a change arrives during an automatic run', async () => {
    const { service, sent } = setup({ watch: true });
    await service.setSession(ARTEM);
    const first = service.autoSync();
    await service.autoSync();
    await first;
    await vi.waitFor(() => expect(sent.filter(([channel]) => channel === IPC.syncAuto)).toHaveLength(2));
  });

  it('does not restore the plan of the previous folder when the folder changes during a scan', async () => {
    await mkdir(join(root, 'Other'));
    const { service, sent } = setup();
    await service.setSession(ARTEM);
    const scanning = service.scan();
    await service.bindFolder(join(root, 'Other'));
    await scanning;
    await service.autoSync();
    expect(sent.filter(([channel]) => channel === IPC.syncAuto)).toHaveLength(1);
  });

  it("account B does not inherit account A's folder or tracking", async () => {
    await writeFile(join(folder, 'artem.txt'), 'only for Artem');
    const { service, watchers, apiOf } = setup({ watch: true });
    await service.setSession(ARTEM);
    expect(watchers).toHaveLength(1);
    await service.setSession(null);
    expect(watchers[0].closed).toBe(true);

    expect(await service.setSession(IRYNA)).toEqual({ serverUrl: 'http://localhost:4000', folderPath: null, watch: false });
    expect(watchers).toHaveLength(1);
    await service.autoSync();
    await expect(service.scan()).rejects.toThrow('Спочатку оберіть локальну папку');
    expect(apiOf(IRYNA.userId).files.size).toBe(0);

    // Iryna binds her own folder; Artem gets his back on the next login
    await mkdir(join(root, 'Iryna'));
    await service.bindFolder(join(root, 'Iryna'));
    expect(await service.setSession(ARTEM)).toEqual({ serverUrl: 'http://localhost:4000', folderPath: folder, watch: true });
    expect(watchers.at(-1)).toMatchObject({ path: folder, closed: false });
  });

  it('logout stops the watcher and clears a held-back rerun', async () => {
    const irynaFolder = join(root, 'Iryna');
    await mkdir(irynaFolder);
    await writeFile(join(irynaFolder, 'iryna.txt'), 'only for Iryna');
    const { settings, service, watchers, apiOf, autoEvents } = setup({ watch: true });
    settings.updateBinding(keyOf(IRYNA), { folderPath: irynaFolder });
    await service.setSession(ARTEM);

    const running = service.autoSync();
    watchers[0].onChange(); // a change during Artem's run is held back for a follow-up run
    await service.setSession(null);
    expect(watchers[0].closed).toBe(true);
    await service.setSession(IRYNA);
    await running;
    await new Promise((resolve) => setTimeout(resolve, 50));

    // nothing of Artem's session runs or reports under Iryna's
    expect(apiOf(IRYNA.userId).text('iryna.txt')).toBeUndefined();
    expect(autoEvents()).toHaveLength(0);
  });

  it('rejects binding a folder or tracking without a signed-in user', async () => {
    const { service } = setup();
    await expect(service.bindFolder(folder)).rejects.toThrow('Спочатку увійдіть до системи');
    await expect(service.setWatch(true)).rejects.toThrow('Спочатку увійдіть до системи');
  });
});
