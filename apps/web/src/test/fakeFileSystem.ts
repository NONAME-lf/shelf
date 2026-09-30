/** The browser's clock in tests: every write stamps the file with `now()`, as a real browser does. */
export class FakeClock {
  constructor(public time = Date.parse('2026-09-30T12:00:00.000Z')) {}

  now = (): number => this.time;

  advance(ms: number): void {
    this.time += ms;
  }
}

type StoredFile = { kind: 'file'; bytes: Uint8Array; lastModified: number };
type Entry = StoredFile | { kind: 'directory'; handle: FakeDirectoryHandle };

const domError = (name: string, message: string) => new DOMException(message, name);

/**
 * In-memory stand-in for a FileSystemDirectoryHandle with the parts BrowserLocalFolder and WebSyncService
 * use: entries(), getFileHandle(), isSameEntry() and Chromium's queryPermission() / requestPermission().
 */
export class FakeDirectoryHandle {
  readonly kind = 'directory';
  /** What queryPermission() answers; after a page reload Chrome answers 'prompt'. */
  permission: PermissionState = 'granted';
  /** Whether the user allows access when requestPermission() shows the prompt. */
  grantOnRequest = true;
  permissionRequests = 0;
  /** While set, requestPermission() rejects with it (e.g. SecurityError when the user gesture expired). */
  requestError: Error | null = null;
  /** The folder was deleted or moved: every call fails with NotFoundError. */
  removed = false;
  private readonly items = new Map<string, Entry>();

  constructor(
    readonly name: string,
    readonly clock: FakeClock,
  ) {}

  setFile(name: string, content: string | Uint8Array, lastModified = this.clock.now()): void {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.items.set(name, { kind: 'file', bytes, lastModified });
  }

  addDirectory(name: string): FakeDirectoryHandle {
    const handle = new FakeDirectoryHandle(name, this.clock);
    this.items.set(name, { kind: 'directory', handle });
    return handle;
  }

  deleteEntry(name: string): void {
    this.items.delete(name);
  }

  has(name: string): boolean {
    return this.items.has(name);
  }

  text(name: string): string | undefined {
    const entry = this.items.get(name);
    return entry?.kind === 'file' ? new TextDecoder().decode(entry.bytes) : undefined;
  }

  lastModified(name: string): number | undefined {
    const entry = this.items.get(name);
    return entry?.kind === 'file' ? entry.lastModified : undefined;
  }

  // --- the FileSystemDirectoryHandle subset ---

  async *entries(): AsyncGenerator<[string, FakeFileHandle | FakeDirectoryHandle]> {
    this.assertUsable();
    for (const [name, entry] of [...this.items]) {
      yield [name, entry.kind === 'file' ? new FakeFileHandle(this, name) : entry.handle];
    }
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileHandle> {
    this.assertUsable();
    const entry = this.items.get(name);
    if (entry?.kind === 'directory') throw domError('TypeMismatchError', `${name} is a directory`);
    if (!entry) {
      if (!options.create) throw domError('NotFoundError', `${name} not found`);
      this.setFile(name, new Uint8Array());
    }
    return new FakeFileHandle(this, name);
  }

  async isSameEntry(other: unknown): Promise<boolean> {
    return other === this;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.permissionRequests += 1;
    if (this.requestError) throw this.requestError;
    if (this.permission !== 'granted' && this.grantOnRequest) this.permission = 'granted';
    return this.permission;
  }

  // --- used by FakeFileHandle ---

  fileEntry(name: string): StoredFile {
    this.assertUsable();
    const entry = this.items.get(name);
    if (entry?.kind !== 'file') throw domError('NotFoundError', `${name} not found`);
    return entry;
  }

  assertUsable(): void {
    if (this.removed) throw domError('NotFoundError', 'A requested file or directory could not be found');
    if (this.permission !== 'granted') throw domError('NotAllowedError', 'The request is not allowed');
  }
}

export class FakeFileHandle {
  readonly kind = 'file';

  constructor(
    private readonly directory: FakeDirectoryHandle,
    readonly name: string,
  ) {}

  async getFile(): Promise<File> {
    const entry = this.directory.fileEntry(this.name);
    return new File([new Uint8Array(entry.bytes)], this.name, { lastModified: entry.lastModified });
  }

  /** Like Chrome: the data goes to `<name>.crswap` and replaces the file on close() with the time of now. */
  async createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> {
    const { directory, name } = this;
    directory.assertUsable();
    const swap = `${name}.crswap`;
    directory.setFile(swap, new Uint8Array());
    const chunks: Uint8Array[] = [];
    return {
      async write(data: Uint8Array) {
        chunks.push(new Uint8Array(data));
      },
      async close() {
        const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        directory.deleteEntry(swap);
        directory.setFile(name, bytes, directory.clock.now());
      },
      async abort() {
        directory.deleteEntry(swap);
      },
    };
  }
}

/** The fakes stand in for the browser's handle types. */
export const asDirectoryHandle = (fake: FakeDirectoryHandle) => fake as unknown as FileSystemDirectoryHandle;
