import { isSafeFileName, isSyncableName, type LocalFile, type LocalFolder } from '@shelf/shared';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, rename, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** LocalFolder over Node fs. A downloaded file gets the server's modification time. */
export class NodeLocalFolder implements LocalFolder {
  constructor(readonly path: string) {}

  async listFiles(): Promise<LocalFile[]> {
    const entries = await readdir(this.path, { withFileTypes: true });
    const files: LocalFile[] = [];
    for (const entry of entries) {
      if (entry.isFile() && isSyncableName(entry.name)) files.push(await this.describe(entry.name));
    }
    return files;
  }

  async read(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(name)));
  }

  async write(name: string, bytes: Uint8Array, modifiedAt: Date): Promise<LocalFile> {
    const target = this.resolve(name);
    const temp = join(this.path, `.${name}.shelf-part`);
    await writeFile(temp, bytes);
    await utimes(temp, modifiedAt, modifiedAt);
    await rename(temp, target);
    return this.describe(name);
  }

  checksum(name: string): Promise<string> {
    const file = this.resolve(name);
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      createReadStream(file)
        .on('error', reject)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async describe(name: string): Promise<LocalFile> {
    const path = this.resolve(name);
    const info = await stat(path);
    return { name, path, size: info.size, modifiedAt: Math.round(info.mtimeMs) };
  }

  private resolve(name: string): string {
    if (!isSafeFileName(name)) throw new Error(`Недопустима назва файлу: «${name}»`);
    return join(this.path, name);
  }
}
