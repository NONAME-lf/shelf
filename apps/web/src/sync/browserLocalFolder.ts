import { isSafeFileName, isSyncableName, sha256Hex, type LocalFile, type LocalFolder } from '@shelf/shared';
import { errorName, explainBrowserError } from './browserErrors';

/** While `createWritable()` is open Chrome writes to `<name>.crswap` next to the file. */
const SWAP_SUFFIX = '.crswap';

/** A name the folder lists: syncable (not hidden, safe) and not one of Chrome's swap files. */
export function isListedName(name: string): boolean {
  return isSyncableName(name) && !name.endsWith(SWAP_SUFFIX);
}

/**
 * LocalFolder over the File System Access API (spec §7.5). `path` is the binding id — the key of this
 * folder's snapshot: a page never learns where the folder is, only its name.
 */
export class BrowserLocalFolder implements LocalFolder {
  constructor(
    private readonly handle: FileSystemDirectoryHandle,
    readonly path: string,
  ) {}

  get name(): string {
    return this.handle.name;
  }

  async listFiles(): Promise<LocalFile[]> {
    const files: LocalFile[] = [];
    try {
      for await (const [name, entry] of this.handle.entries()) {
        if (entry.kind !== 'file' || !isListedName(name)) continue;
        const file = await fileOrNull(entry as FileSystemFileHandle);
        if (file) files.push(this.describe(name, file));
      }
    } catch (error) {
      throw explainBrowserError(error, this.handle.name);
    }
    return files;
  }

  async read(name: string): Promise<Uint8Array> {
    try {
      const handle = await this.handle.getFileHandle(this.checked(name));
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch (error) {
      throw explainBrowserError(error, this.handle.name, name);
    }
  }

  /**
   * A browser cannot set a file's modification time: the written file gets "now", whatever `modifiedAt`
   * says. SyncEngine records what this returns as the snapshot's `localModifiedAt`, so it must be the time
   * the file really got — then the next scan sees the downloaded file unchanged (spec §5.4).
   */
  async write(name: string, bytes: Uint8Array, _modifiedAt: Date): Promise<LocalFile> {
    let created = false;
    try {
      const safe = this.checked(name);
      // Look the file up first: `create: true` would leave an empty file behind when the write fails, and
      // the next run would take that empty file for a newer local edit and upload it over the server copy.
      let handle = await existingFileHandle(this.handle, safe);
      if (!handle) {
        handle = await this.handle.getFileHandle(safe, { create: true });
        created = true;
      }
      const writable = await handle.createWritable();
      try {
        await writable.write(new Uint8Array(bytes));
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      return this.describe(name, await handle.getFile());
    } catch (error) {
      // An existing file keeps its old content (the writable is a swap); a file this call created is
      // removed. Remaining window: a crash or a closed tab between the create and the close leaves an empty
      // file that the next run treats as a local edit — the browser gives no atomic create-with-content.
      if (created) await this.handle.removeEntry(name).catch(() => undefined);
      throw explainBrowserError(error, this.handle.name, name);
    }
  }

  async checksum(name: string): Promise<string> {
    return sha256Hex(await this.read(name));
  }

  private describe(name: string, file: File): LocalFile {
    return { name, path: `${this.handle.name}/${name}`, size: file.size, modifiedAt: file.lastModified };
  }

  private checked(name: string): string {
    if (!isSafeFileName(name)) throw new Error(`Недопустима назва файлу: «${name}»`);
    return name;
  }
}

/** A file removed between the directory listing and this call is simply not listed. */
async function fileOrNull(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    return await handle.getFile();
  } catch (error) {
    if (errorName(error) === 'NotFoundError') return null;
    throw error;
  }
}

/** The handle of an existing file, or null when there is none (a sub-folder of that name still throws). */
async function existingFileHandle(directory: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle | null> {
  try {
    return await directory.getFileHandle(name);
  } catch (error) {
    if (errorName(error) === 'NotFoundError') return null;
    throw error;
  }
}
