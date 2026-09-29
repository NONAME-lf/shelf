import { emptySnapshot, type SnapshotStore, type SyncSnapshot } from '@shelf/shared';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** One JSON file per bound folder in userData/snapshots. A missing or broken file means "never synchronized". */
export class JsonSnapshotStore implements SnapshotStore {
  constructor(private readonly dir: string) {}

  fileFor(folderPath: string): string {
    return join(this.dir, `${createHash('sha1').update(folderPath).digest('hex')}.json`);
  }

  async load(folderPath: string): Promise<SyncSnapshot> {
    try {
      const parsed = JSON.parse(await readFile(this.fileFor(folderPath), 'utf8')) as SyncSnapshot;
      if (parsed?.folderPath !== folderPath || typeof parsed.entries !== 'object' || parsed.entries === null) {
        return emptySnapshot(folderPath);
      }
      return parsed;
    } catch {
      return emptySnapshot(folderPath);
    }
  }

  async save(snapshot: SyncSnapshot): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const file = this.fileFor(snapshot.folderPath);
    await writeFile(`${file}.tmp`, JSON.stringify(snapshot, null, 2));
    await rename(`${file}.tmp`, file);
  }
}
