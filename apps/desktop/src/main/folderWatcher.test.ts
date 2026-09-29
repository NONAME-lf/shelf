import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderWatcher } from './folderWatcher';

let dir: string;
let watcher: FolderWatcher | null = null;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelf-watch-'));
});
afterEach(async () => {
  await watcher?.close();
  watcher = null;
  await rm(dir, { recursive: true, force: true });
});

describe('FolderWatcher', () => {
  it('calls back after a file appears in the folder', async () => {
    const onChange = vi.fn();
    watcher = new FolderWatcher(dir, onChange, 150);
    await watcher.ready();
    await writeFile(join(dir, 'lab-notes.txt'), 'hello');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 8000, interval: 100 });
  });

  it('ignores hidden files', async () => {
    const onChange = vi.fn();
    watcher = new FolderWatcher(dir, onChange, 150);
    await watcher.ready();
    await writeFile(join(dir, '.DS_Store'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('settles ready() when closed before it is ready', async () => {
    watcher = new FolderWatcher(dir, vi.fn(), 150);
    const ready = watcher.ready();
    await watcher.close();
    await expect(ready).resolves.toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('settles ready() for a folder that cannot be read', async () => {
    await chmod(dir, 0o000);
    try {
      watcher = new FolderWatcher(dir, vi.fn(), 150);
      await expect(watcher.ready()).resolves.toBeUndefined();
    } finally {
      await chmod(dir, 0o755);
    }
  });
});
