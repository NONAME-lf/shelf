import { watch, type FSWatcher } from 'chokidar';
import { basename } from 'node:path';

/** UC14a: watches the top level of the bound folder and calls back once per burst of changes. */
export class FolderWatcher {
  private readonly watcher: FSWatcher;
  private timer: NodeJS.Timeout | null = null;
  private readonly readyPromise: Promise<void>;
  private settleReady: () => void = () => undefined;

  constructor(
    folderPath: string,
    private readonly onChange: () => void,
    private readonly debounceMs = 1500,
  ) {
    this.watcher = watch(folderPath, {
      depth: 0,
      ignoreInitial: true,
      ignored: (path: string) => path !== folderPath && basename(path).startsWith('.'),
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });
    // ready() must always settle: chokidar drops its listeners on close() and may fail with 'error' before 'ready'
    this.readyPromise = new Promise((resolve) => {
      this.settleReady = resolve;
      this.watcher.once('ready', () => resolve());
    });
    this.watcher.on('error', () => this.settleReady());
    this.watcher.on('all', () => this.schedule());
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.settleReady();
    await this.watcher.close();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onChange();
    }, this.debounceMs);
  }
}
