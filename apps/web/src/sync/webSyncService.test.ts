import { MemorySnapshotStore, Side, SyncStatus, ApiError } from '@shelf/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeApi } from '../test/fakeApi';
import { asDirectoryHandle, FakeClock, FakeDirectoryHandle } from '../test/fakeFileSystem';
import type { FolderBinding, FolderBindings } from './folderBindingStore';
import { everyInterval, permissionMessage, POLL_INTERVAL_MS, WebSyncService, type AutoSyncEvent } from './webSyncService';

const ARTEM = 'user-artem@http://localhost:4000/api';
const IRYNA = 'user-iryna@http://localhost:4000/api';

class MemoryFolderBindings implements FolderBindings {
  private readonly bindings = new Map<string, FolderBinding>();

  async get(account: string): Promise<FolderBinding | null> {
    return this.bindings.get(account) ?? null;
  }

  async put(binding: FolderBinding): Promise<void> {
    this.bindings.set(binding.account, { ...binding });
  }
}

type FakeTimer = { ms: number; tick: () => Promise<void>; stopped: boolean };

/** Artem's folder is "Shelf"; every account has its own in-memory server space. Timers tick only when a test says so. */
function setup() {
  const clock = new FakeClock();
  const folder = new FakeDirectoryHandle('Shelf', clock);
  const bindings = new MemoryFolderBindings();
  const snapshots = new MemorySnapshotStore();
  const apis = new Map<string, FakeApi>();
  const apiOf = (account: string) => apis.get(account) ?? apis.set(account, new FakeApi()).get(account)!;
  const events: AutoSyncEvent[] = [];
  const timers: FakeTimer[] = [];
  const page = { visible: true };
  let next: FakeDirectoryHandle | Error = folder;
  let ids = 0;
  const service = new WebSyncService({
    bindings,
    snapshots,
    pickFolder: async () => {
      if (next instanceof Error) throw next;
      return asDirectoryHandle(next);
    },
    onAutoSync: (event) => events.push(event),
    every: (ms, tick) => {
      const timer: FakeTimer = { ms, tick, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    isVisible: () => page.visible,
    newId: () => `binding-${++ids}`,
  });
  const signIn = (account: string) => service.setSession({ account, api: apiOf(account) });
  const pick = (choice: FakeDirectoryHandle | Error) => {
    next = choice;
  };
  /** Artem signed in with "Shelf" bound; `watch` turns tracking on. */
  const artemWithFolder = async (watch = false) => {
    await signIn(ARTEM);
    await service.chooseFolder();
    if (watch) await service.setWatch(true);
  };
  return { clock, folder, bindings, snapshots, apiOf, events, timers, page, service, signIn, pick, artemWithFolder };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WebSyncService', () => {
  it('scans and synchronizes the bound folder', async () => {
    const { folder, apiOf, service, artemWithFolder } = setup();
    folder.setFile('Main.kt', 'fun main() {}');
    await artemWithFolder();

    expect((await service.scan()).map((item) => [item.name, item.status])).toEqual([['Main.kt', SyncStatus.LOCAL_ONLY]]);
    const result = await service.run({});
    expect(result.report).toMatchObject({ uploaded: 1, errors: [] });
    expect(apiOf(ARTEM).text('Main.kt')).toBe('fun main() {}');
  });

  it('applies the resolution chosen in the conflict dialog', async () => {
    const { clock, folder, apiOf, service, artemWithFolder } = setup();
    folder.setFile('todo.txt', 'v1');
    await artemWithFolder();
    await service.run({});

    await apiOf(ARTEM).put('todo.txt', 'server edit');
    clock.advance(60_000);
    folder.setFile('todo.txt', 'local edit, much later');
    expect((await service.scan()).map((item) => item.status)).toEqual([SyncStatus.CONFLICT]);
    const result = await service.run({ 'todo.txt': Side.REMOTE });
    expect(result.report).toMatchObject({ downloaded: 1, conflicts: 1 });
    expect(folder.text('todo.txt')).toBe('server edit');
  });

  it('refuses to start a second operation while one is running', async () => {
    const { service, artemWithFolder } = setup();
    await artemWithFolder();
    const first = service.scan();
    await expect(service.run({})).rejects.toThrow('Синхронізація вже виконується');
    await first;
  });

  it('explains what is missing', async () => {
    const { service, signIn } = setup();
    await expect(service.scan()).rejects.toThrow('Спочатку увійдіть до системи');
    await expect(service.chooseFolder()).rejects.toThrow('Спочатку увійдіть до системи');
    await expect(service.setWatch(true)).rejects.toThrow('Спочатку увійдіть до системи');
    await signIn(ARTEM);
    await expect(service.scan()).rejects.toThrow('Спочатку оберіть локальну папку');
    await expect(service.setWatch(true)).rejects.toThrow('Спочатку оберіть локальну папку');
  });

  it('binds the chosen folder to the account; closing the picker changes nothing', async () => {
    const { bindings, service, signIn, pick } = setup();
    await signIn(ARTEM);
    pick(new DOMException('The user aborted a request.', 'AbortError'));
    expect(await service.chooseFolder()).toEqual({ folderName: null, watch: false });
    expect(await bindings.get(ARTEM)).toBeNull();

    pick(new FakeDirectoryHandle('Shelf', new FakeClock()));
    expect(await service.chooseFolder()).toEqual({ folderName: 'Shelf', watch: false });
    expect(await bindings.get(ARTEM)).toMatchObject({ account: ARTEM, id: 'binding-1', watch: false });
  });

  it('a picker failure other than closing it gets its own Ukrainian message and binds nothing', async () => {
    const { bindings, service, signIn, pick } = setup();
    await signIn(ARTEM);
    pick(new DOMException('Must be handling a user gesture', 'SecurityError'));
    await expect(service.chooseFolder()).rejects.toThrow('Не вдалося відкрити вибір папки');
    expect(await bindings.get(ARTEM)).toBeNull();
  });

  it('keeps the snapshot when the same folder is chosen again and starts a new one for another folder', async () => {
    const { clock, folder, bindings, snapshots, service, pick, artemWithFolder } = setup();
    folder.setFile('a.txt', 'x');
    await artemWithFolder();
    await service.run({});

    await service.chooseFolder();
    expect((await bindings.get(ARTEM))?.id).toBe('binding-1');
    expect(Object.keys((await snapshots.load('binding-1')).entries)).toEqual(['a.txt']);

    pick(new FakeDirectoryHandle('Other', clock));
    await service.chooseFolder();
    expect((await bindings.get(ARTEM))?.id).toBe('binding-2');
  });

  it('polls every 5 s while tracking is on and synchronizes only when the listing changed', async () => {
    const { folder, apiOf, events, timers, service, artemWithFolder } = setup();
    await artemWithFolder();
    expect(timers).toHaveLength(0);

    expect(await service.setWatch(true)).toEqual({ folderName: 'Shelf', watch: true });
    expect(timers).toEqual([expect.objectContaining({ ms: POLL_INTERVAL_MS, stopped: false })]);
    await timers[0].tick(); // the tick when tracking starts
    expect(events).toEqual([{ report: expect.objectContaining({ uploaded: 0 }), error: null, syncedAt: expect.any(String) }]);

    await timers[0].tick();
    expect(events).toHaveLength(1); // nothing changed, nothing sent to the server

    folder.setFile('auto.txt', 'x');
    await timers[0].tick();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ error: null, report: { uploaded: 1 } });
    expect(apiOf(ARTEM).text('auto.txt')).toBe('x');

    await service.setWatch(false);
    expect(timers[0].stopped).toBe(true);
  });

  it('does not poll while the tab is hidden', async () => {
    const { folder, apiOf, events, timers, page, artemWithFolder } = setup();
    folder.setFile('a.txt', 'x');
    await artemWithFolder(true);
    page.visible = false;
    await timers[0].tick();
    expect(events).toHaveLength(0);
    expect(apiOf(ARTEM).files.size).toBe(0);

    page.visible = true;
    await timers[0].tick();
    expect(apiOf(ARTEM).text('a.txt')).toBe('x');
  });

  it('does not synchronize automatically while a conflict dialog is open', async () => {
    const { folder, apiOf, events, timers, service, artemWithFolder } = setup();
    await artemWithFolder(true);
    await timers[0].tick();
    folder.setFile('draft.txt', 'local');
    await service.scan(); // the plan waits for the dialog
    await timers[0].tick();
    expect(events).toHaveLength(1);
    expect(apiOf(ARTEM).text('draft.txt')).toBeUndefined();

    // cancelling the dialog resumes the automatic run that was held back
    service.cancel();
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(apiOf(ARTEM).text('draft.txt')).toBe('local');
  });

  it('waits for a running automatic run before a manual scan instead of failing', async () => {
    const { folder, apiOf, service, artemWithFolder } = setup();
    folder.setFile('notes.txt', 'x');
    await artemWithFolder(true);
    const automatic = service.autoSync();
    const items = await service.scan();
    await automatic;
    // the scan saw the folder after the automatic run had uploaded the file
    expect(apiOf(ARTEM).text('notes.txt')).toBe('x');
    expect(items.map((item) => [item.name, item.status])).toEqual([['notes.txt', SyncStatus.IN_SYNC]]);
  });

  it('runs one follow-up automatic run when a change arrives during an automatic run', async () => {
    const { events, service, artemWithFolder } = setup();
    await artemWithFolder(true);
    const first = service.autoSync();
    await service.autoSync();
    await service.autoSync();
    await first;
    await vi.waitFor(() => expect(events).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toHaveLength(2);
  });

  it('does not keep the plan of the previous folder when the folder changes during a scan', async () => {
    const { clock, apiOf, events, service, pick, artemWithFolder } = setup();
    await artemWithFolder(true);
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scanning = service.scan();
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));
    pick(new FakeDirectoryHandle('Other', clock));
    await service.chooseFolder();
    apiOf(ARTEM).gate = null;
    release();
    await scanning;
    // no plan of "Shelf" is pending, so the automatic run of "Other" is not held back
    await service.autoSync();
    expect(events).toHaveLength(1);
  });

  it('without folder permission tracking reports once and waits; a manual sync asks for it', async () => {
    const { folder, apiOf, events, timers, service, artemWithFolder } = setup();
    folder.setFile('notes.txt', 'x');
    await artemWithFolder(true);
    folder.permission = 'prompt'; // Chrome after a page reload
    await timers[0].tick();
    await timers[0].tick();
    expect(events).toEqual([{ report: null, error: permissionMessage('Shelf'), syncedAt: expect.any(String) }]);
    expect(folder.permissionRequests).toBe(0);
    expect(apiOf(ARTEM).files.size).toBe(0);

    folder.grantOnRequest = false;
    await expect(service.scan()).rejects.toThrow('Доступ до папки «Shelf» не надано');
    expect(folder.permissionRequests).toBe(1);

    folder.grantOnRequest = true;
    await service.run({});
    expect(folder.permissionRequests).toBe(2);
    expect(apiOf(ARTEM).text('notes.txt')).toBe('x');
  });

  it('reports a failing automatic run once and retries it on the next poll', async () => {
    const { folder, apiOf, events, timers, artemWithFolder } = setup();
    await artemWithFolder(true);
    folder.setFile('offline.txt', 'x');
    apiOf(ARTEM).failWith = new ApiError(0, "Сервер недоступний — перевірте з'єднання");
    await timers[0].tick();
    await timers[0].tick();
    expect(events.map((event) => event.error)).toEqual(["Сервер недоступний — перевірте з'єднання"]);

    apiOf(ARTEM).failWith = null;
    await timers[0].tick();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ error: null, report: { uploaded: 1 } });
  });

  it('reports an IndexedDB failure of an automatic run in Ukrainian', async () => {
    const { folder, snapshots, events, timers, artemWithFolder } = setup();
    await artemWithFolder(true);
    folder.setFile('a.txt', 'x');
    snapshots.load = async () => {
      throw new DOMException('Internal error opening backing store', 'UnknownError');
    };
    await timers[0].tick();
    expect(events).toHaveLength(1);
    expect(events[0].error).toContain('IndexedDB');
    expect(events[0].error).not.toContain('backing store');
  });

  it('explains a failing permission query of a poll with the folder name', async () => {
    const { folder, events, timers, artemWithFolder } = setup();
    await artemWithFolder(true);
    folder.queryError = new DOMException('gone', 'NotFoundError');
    await timers[0].tick();
    expect(events.map((event) => event.error)).toEqual(['Папку «Shelf» не знайдено — виберіть її знову']);
  });

  it('explains an isSameEntry failure when another folder is chosen', async () => {
    const { clock, folder, service, pick, artemWithFolder } = setup();
    await artemWithFolder();
    folder.sameEntryError = new DOMException('gone', 'NotFoundError');
    pick(new FakeDirectoryHandle('Other', clock));
    await expect(service.chooseFolder()).rejects.toThrow('Папку «Shelf» не знайдено');
  });

  it("account B does not inherit account A's folder or tracking", async () => {
    const { clock, folder, apiOf, timers, service, signIn, pick, artemWithFolder } = setup();
    folder.setFile('artem.txt', 'only for Artem');
    await artemWithFolder(true);
    await timers[0].tick();
    expect(apiOf(ARTEM).text('artem.txt')).toBe('only for Artem');

    expect(await signIn(IRYNA)).toEqual({ folderName: null, watch: false });
    expect(timers[0].stopped).toBe(true);
    expect(timers).toHaveLength(1);
    await service.autoSync();
    await expect(service.scan()).rejects.toThrow('Спочатку оберіть локальну папку');
    expect(apiOf(IRYNA).files.size).toBe(0);

    // Iryna binds her own folder; Artem gets his back, with tracking, on the next login
    pick(new FakeDirectoryHandle('Iryna', clock));
    expect(await service.chooseFolder()).toEqual({ folderName: 'Iryna', watch: false });
    expect(await signIn(ARTEM)).toEqual({ folderName: 'Shelf', watch: true });
    expect(timers).toHaveLength(2);
    expect(timers[1]).toMatchObject({ stopped: false });
  });

  it('logout stops polling and drops a late automatic result', async () => {
    const { clock, folder, apiOf, events, timers, service, signIn, pick, artemWithFolder } = setup();
    await artemWithFolder(true);
    await timers[0].tick();
    expect(events).toHaveLength(1);

    // Iryna's folder; she binds and tracks it after Artem has logged out
    const irynaFolder = new FakeDirectoryHandle('Iryna', clock);
    irynaFolder.setFile('iryna.txt', 'only for Iryna');

    folder.setFile('late.txt', 'x');
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = timers[0].tick();
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));
    await service.autoSync(); // a change during Artem's run is held back for a follow-up run

    await service.setSession(null);
    expect(timers[0].stopped).toBe(true);
    await signIn(IRYNA);
    pick(irynaFolder);
    await service.chooseFolder();
    await service.setWatch(true);
    release();
    await running;
    await new Promise((resolve) => setTimeout(resolve, 50));

    // nothing of Artem's session runs or reports under Iryna's
    expect(events).toHaveLength(1);
    expect(apiOf(IRYNA).text('iryna.txt')).toBeUndefined();
  });

  it("logout drops a late automatic error of the previous account", async () => {
    const { clock, folder, apiOf, events, timers, service, signIn, pick, artemWithFolder } = setup();
    await artemWithFolder(true);
    await timers[0].tick();
    expect(events).toHaveLength(1);

    folder.setFile('late.txt', 'x');
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = timers[0].tick();
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));

    await service.setSession(null);
    await signIn(IRYNA);
    pick(new FakeDirectoryHandle('Iryna', clock));
    await service.chooseFolder();
    apiOf(ARTEM).failWith = new ApiError(0, "Сервер недоступний — перевірте з'єднання");
    release();
    await running;

    expect(events).toHaveLength(1);
  });

  it('asks for the folder permission before waiting for a running automatic run', async () => {
    const { folder, apiOf, service, artemWithFolder } = setup();
    folder.setFile('notes.txt', 'x');
    await artemWithFolder(true);
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const automatic = service.autoSync();
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));
    folder.permission = 'prompt';

    const scanning = service.scan();
    await vi.waitFor(() => expect(folder.permissionRequests).toBe(1)); // still gated: the click is a user gesture
    expect(apiOf(ARTEM).waiting).toBe(1);
    apiOf(ARTEM).gate = null;
    release();
    await automatic;
    await scanning;
  });

  it('runs the automatic run held back during a manual scan even when that scan fails', async () => {
    const { folder, events, timers, service, artemWithFolder } = setup();
    await artemWithFolder(true);
    await timers[0].tick();
    folder.permission = 'prompt';
    folder.grantOnRequest = false;
    const scanning = service.scan(); // starts synchronously: a manual operation is running
    await service.autoSync(); // held back
    await expect(scanning).rejects.toThrow('Доступ до папки «Shelf» не надано');
    // the follow-up run started; without folder permission it reports that instead of staying silent
    await vi.waitFor(() => expect(events.map((event) => event.error)).toEqual([null, permissionMessage('Shelf')]));
  });

  it('does not synchronize automatically while tracking is off', async () => {
    const { folder, apiOf, events, service, artemWithFolder } = setup();
    folder.setFile('a.txt', 'x');
    await artemWithFolder();
    await service.autoSync();
    expect(events).toHaveLength(0);
    expect(apiOf(ARTEM).files.size).toBe(0);
  });

  it("a manual run that waits for an automatic run stays with its own account", async () => {
    const { folder, apiOf, service, signIn, artemWithFolder } = setup();
    folder.setFile('a.txt', 'x');
    await artemWithFolder(true);
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const automatic = service.autoSync();
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));
    const running = service.run({});
    await new Promise((resolve) => setTimeout(resolve, 0)); // the run has built its engine and waits
    await signIn(IRYNA);
    apiOf(ARTEM).gate = null;
    release();
    await automatic;
    await expect(running).resolves.toMatchObject({ report: { errors: [] } });
    expect(apiOf(ARTEM).text('a.txt')).toBe('x');
    expect(apiOf(IRYNA).files.size).toBe(0);
  });

  it("the new folder's first poll is not lost behind a poll of the previous folder", async () => {
    const { clock, folder, apiOf, timers, service, pick, artemWithFolder } = setup();
    folder.setFile('old.txt', 'old');
    await artemWithFolder(true);
    let release = () => {};
    apiOf(ARTEM).gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const oldPoll = timers[0].tick(); // its run is held at the server
    await vi.waitFor(() => expect(apiOf(ARTEM).waiting).toBe(1));

    const other = new FakeDirectoryHandle('Other', clock);
    other.setFile('new.txt', 'new');
    pick(other);
    await service.chooseFolder();
    expect(timers).toHaveLength(2);
    await timers[1].tick(); // the immediate tick of the new poller

    apiOf(ARTEM).gate = null;
    release();
    await oldPoll;
    await vi.waitFor(() => expect(apiOf(ARTEM).text('new.txt')).toBe('new'));
  });
});

describe('everyInterval', () => {
  it('ticks at once, then every interval until stopped', () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    const stop = everyInterval(POLL_INTERVAL_MS, tick);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * POLL_INTERVAL_MS);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(2 * POLL_INTERVAL_MS);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
