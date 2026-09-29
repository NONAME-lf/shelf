import { isSafeFileName, isSyncableName, type LocalFile, type LocalFolder } from '@shelf/shared';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { explainFsError } from './fsErrors';

/** LocalFolder over Node fs. A downloaded file gets the server's modification time. */
export class NodeLocalFolder implements LocalFolder {
  constructor(readonly path: string) {}

  async listFiles(): Promise<LocalFile[]> {
    const entries = await readdir(this.path, { withFileTypes: true }).catch((error: unknown) => {
      throw explainFsError(error, this.path, 'folder');
    });
    const files: LocalFile[] = [];
    for (const entry of entries) {
      if (entry.isFile() && isSyncableName(entry.name)) files.push(await this.describe(entry.name));
    }
    return files;
  }

  async read(name: string): Promise<Uint8Array> {
    const file = this.resolve(name);
    try {
      return new Uint8Array(await readFile(file));
    } catch (error) {
      throw explainFsError(error, file, 'file');
    }
  }

  async write(name: string, bytes: Uint8Array, modifiedAt: Date): Promise<LocalFile> {
    const target = this.resolve(name);
    // fixed-length hidden name: long file names must still fit, and listings and the watcher ignore it
    const temp = join(this.path, `.shelf-${randomUUID()}.part`);
    try {
      await writeFile(temp, bytes);
      await utimes(temp, modifiedAt, modifiedAt);
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      // the temporary file is created in the folder: a missing or read-only folder is what failed
      throw explainFsError(error, this.path, 'folder');
    }
    return this.describe(name);
  }

  checksum(name: string): Promise<string> {
    const file = this.resolve(name);
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      createReadStream(file)
        .on('error', (error) => reject(explainFsError(error, file, 'file')))
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async describe(name: string): Promise<LocalFile> {
    const path = this.resolve(name);
    const info = await stat(path).catch((error: unknown) => {
      throw explainFsError(error, path, 'file');
    });
    return { name, path, size: info.size, modifiedAt: Math.round(info.mtimeMs) };
  }

  private resolve(name: string): string {
    if (!isSafeFileName(name)) throw new Error(`Недопустима назва файлу: «${name}»`);
    return join(this.path, name);
  }
}
