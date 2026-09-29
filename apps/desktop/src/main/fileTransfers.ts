import { isSafeFileName, type SyncApi } from '@shelf/shared';
import { dialog, type BrowserWindow, type NativeImage, type WebContents } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TransferFile } from '../shared/ipc';
import { explainFsError } from './fsErrors';

const keyOf = (file: TransferFile) => `${file.id}@${file.modifiedAt}`;

/** UC11 «Save as…» and UC11a «Drag out of the window». Drag-out needs the file on disk before the drag starts. */
export class FileTransfers {
  private readonly prepared = new Map<string, Promise<string>>();

  constructor(
    private readonly api: () => SyncApi,
    private readonly tempDir: string,
  ) {}

  async saveAs(window: BrowserWindow, file: TransferFile): Promise<boolean> {
    const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'Зберегти файл', defaultPath: file.name });
    if (canceled || !filePath) return false;
    const bytes = await this.bytes(file);
    try {
      await writeFile(filePath, bytes);
    } catch (error) {
      throw explainFsError(error, filePath, 'file');
    }
    return true;
  }

  prepareDrag(file: TransferFile): Promise<string> {
    const key = keyOf(file);
    let pending = this.prepared.get(key);
    if (!pending) {
      pending = (async () => {
        if (!isSafeFileName(file.name) || !isSafeFileName(file.id)) throw new Error(`Недопустима назва файлу: «${file.name}»`);
        const dir = join(this.tempDir, file.id);
        await mkdir(dir, { recursive: true });
        const target = join(dir, file.name);
        await writeFile(target, await this.bytes(file));
        return target;
      })();
      pending.catch(() => this.prepared.delete(key));
      this.prepared.set(key, pending);
    }
    return pending;
  }

  async startDrag(sender: WebContents, file: TransferFile, icon: NativeImage): Promise<void> {
    sender.startDrag({ file: await this.prepareDrag(file), icon });
  }

  async cleanup(): Promise<void> {
    this.prepared.clear();
    await rm(this.tempDir, { recursive: true, force: true });
  }

  private async bytes(file: TransferFile): Promise<Uint8Array> {
    const blob = await this.api().download(file.id);
    return new Uint8Array(await blob.arrayBuffer());
  }
}
