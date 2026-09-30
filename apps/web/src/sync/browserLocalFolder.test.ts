import { MemorySnapshotStore, sha256Hex, SyncEngine, SyncStatus } from '@shelf/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeApi } from '../test/fakeApi';
import { asDirectoryHandle, FakeClock, FakeDirectoryHandle } from '../test/fakeFileSystem';
import { BrowserLocalFolder } from './browserLocalFolder';

const HOUR = 3_600_000;
let clock: FakeClock;
let root: FakeDirectoryHandle;
let folder: BrowserLocalFolder;

beforeEach(() => {
  clock = new FakeClock();
  root = new FakeDirectoryHandle('Shelf', clock);
  folder = new BrowserLocalFolder(asDirectoryHandle(root), 'binding-1');
});

describe('BrowserLocalFolder', () => {
  it('lists only syncable top-level files: no sub-folders, hidden files or .crswap swap files', async () => {
    root.setFile('Main.kt', 'fun main() {}', clock.now() - HOUR);
    root.setFile('.DS_Store', 'x');
    root.setFile('photo.jpg.crswap', 'half-written');
    root.addDirectory('docs').setFile('inner.txt', 'x');

    expect(await folder.listFiles()).toEqual([
      { name: 'Main.kt', path: 'Shelf/Main.kt', size: 13, modifiedAt: clock.now() - HOUR },
    ]);
    expect(folder.path).toBe('binding-1');
    expect(folder.name).toBe('Shelf');
  });

  it('reads the bytes and computes the checksum the server would', async () => {
    root.setFile('notes.txt', 'Полиця');
    expect(new TextDecoder().decode(await folder.read('notes.txt'))).toBe('Полиця');
    expect(await folder.checksum('notes.txt')).toBe(await sha256Hex(new TextEncoder().encode('Полиця')));
  });

  it('write returns the time the file really got, not the requested server time', async () => {
    const serverTime = new Date(clock.now() - 24 * HOUR);
    const written = await folder.write('photo.jpg', new TextEncoder().encode('jpg-bytes'), serverTime);

    expect(written).toEqual({ name: 'photo.jpg', path: 'Shelf/photo.jpg', size: 9, modifiedAt: clock.now() });
    expect(root.lastModified('photo.jpg')).toBe(clock.now());
    expect(root.has('photo.jpg.crswap')).toBe(false);
    expect(await folder.listFiles()).toEqual([written]);
  });

  it('a downloaded file is IN_SYNC on the next scan, so it is never uploaded back', async () => {
    const api = new FakeApi();
    const snapshots = new MemorySnapshotStore();
    const engine = () => new SyncEngine({ localFolder: folder, snapshotStore: snapshots, api });
    const entry = await api.put('photo.jpg', 'jpg-bytes');

    expect(await engine().synchronize()).toMatchObject({ downloaded: 1, uploaded: 0, errors: [] });
    expect(root.lastModified('photo.jpg')).not.toBe(Date.parse(entry.modifiedAt));

    clock.advance(HOUR);
    expect((await engine().scan()).map((item) => item.status)).toEqual([SyncStatus.IN_SYNC]);
    expect(await engine().synchronize()).toMatchObject({ uploaded: 0, downloaded: 0, skipped: 1 });
    expect(api.uploads).toBe(0);
  });

  it('detects a conflict after edits on both sides', async () => {
    const api = new FakeApi();
    const snapshots = new MemorySnapshotStore();
    const engine = () => new SyncEngine({ localFolder: folder, snapshotStore: snapshots, api });
    root.setFile('todo.txt', 'v1');
    await engine().synchronize();

    await api.put('todo.txt', 'server edit');
    clock.advance(HOUR);
    root.setFile('todo.txt', 'local edit');
    expect((await engine().scan()).map((item) => item.status)).toEqual([SyncStatus.CONFLICT]);
  });

  it('a failed download of a new file leaves no file behind, so the next run downloads it again', async () => {
    const api = new FakeApi();
    const snapshots = new MemorySnapshotStore();
    const engine = () => new SyncEngine({ localFolder: folder, snapshotStore: snapshots, api });
    await api.put('report.txt', 'server copy');

    root.closeError = new DOMException('disk full', 'QuotaExceededError');
    expect(await engine().synchronize()).toMatchObject({ downloaded: 0, uploaded: 0 });
    expect(root.has('report.txt')).toBe(false);
    expect(root.has('report.txt.crswap')).toBe(false);

    clock.advance(HOUR);
    expect(await engine().synchronize()).toMatchObject({ downloaded: 1, uploaded: 0, errors: [] });
    expect(root.text('report.txt')).toBe('server copy');
    expect(api.uploads).toBe(0);
  });

  it('a failed download over an existing file keeps its previous content', async () => {
    root.setFile('report.txt', 'old', clock.now() - HOUR);
    root.closeError = new DOMException('disk full', 'QuotaExceededError');
    await expect(folder.write('report.txt', new TextEncoder().encode('new'), new Date())).rejects.toThrow(
      'Недостатньо місця на диску для «report.txt»',
    );
    expect(root.text('report.txt')).toBe('old');
    expect(root.has('report.txt.crswap')).toBe(false);
  });

  it('explains a missing folder, a withdrawn permission and a missing file in Ukrainian', async () => {
    await expect(folder.read('gone.txt')).rejects.toThrow('Файл «gone.txt» не знайдено');

    root.permission = 'prompt';
    await expect(folder.listFiles()).rejects.toThrow(
      'Немає доступу до папки «Shelf» — натисніть «Синхронізувати» і дозвольте доступ',
    );

    root.permission = 'granted';
    root.removed = true;
    await expect(folder.listFiles()).rejects.toThrow('Папку «Shelf» не знайдено — виберіть її знову');
  });

  it('refuses unsafe names and a name taken by a sub-folder', async () => {
    await expect(folder.write('../escape.txt', new Uint8Array([1]), new Date())).rejects.toThrow(
      'Недопустима назва файлу: «../escape.txt»',
    );
    root.addDirectory('docs');
    await expect(folder.write('docs', new Uint8Array([1]), new Date())).rejects.toThrow(
      '«docs»: у папці вже є вкладена папка з такою назвою',
    );
  });
});
