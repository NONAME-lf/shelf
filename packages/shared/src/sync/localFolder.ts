import { sha256Hex } from '../hash';
import type { LocalFile } from '../types';

/**
 * The bound local folder. Desktop implements it with Node `fs`, the web client with the
 * File System Access API. `write` returns the file as it is on disk afterwards — a browser
 * cannot set the modification time, so the snapshot records whatever time the file got.
 */
export interface LocalFolder {
  readonly path: string;
  listFiles(): Promise<LocalFile[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, bytes: Uint8Array, modifiedAt: Date): Promise<LocalFile>;
  checksum(name: string): Promise<string>;
}

export type MemoryLocalFolderOptions = {
  path?: string;
  /** true (default) imitates the desktop: written files keep the server time; false imitates a browser. */
  keepModifiedAt?: boolean;
  now?: () => number;
};

/** In-memory LocalFolder for tests. */
export class MemoryLocalFolder implements LocalFolder {
  readonly path: string;
  private readonly files = new Map<string, { bytes: Uint8Array; modifiedAt: number }>();

  constructor(private readonly options: MemoryLocalFolderOptions = {}) {
    this.path = options.path ?? '/memory';
  }

  setFile(name: string, content: string | Uint8Array, modifiedAt: number): void {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.set(name, { bytes, modifiedAt });
  }

  has(name: string): boolean {
    return this.files.has(name);
  }

  text(name: string): string | undefined {
    const file = this.files.get(name);
    return file ? new TextDecoder().decode(file.bytes) : undefined;
  }

  async listFiles(): Promise<LocalFile[]> {
    return [...this.files].map(([name, file]) => this.describe(name, file.bytes, file.modifiedAt));
  }

  async read(name: string): Promise<Uint8Array> {
    const file = this.files.get(name);
    if (!file) throw new Error(`Файл не знайдено: ${name}`);
    return file.bytes;
  }

  async write(name: string, bytes: Uint8Array, modifiedAt: Date): Promise<LocalFile> {
    const keep = this.options.keepModifiedAt ?? true;
    const time = keep ? modifiedAt.getTime() : (this.options.now ?? Date.now)();
    this.files.set(name, { bytes, modifiedAt: time });
    return this.describe(name, bytes, time);
  }

  async checksum(name: string): Promise<string> {
    return sha256Hex(await this.read(name));
  }

  private describe(name: string, bytes: Uint8Array, modifiedAt: number): LocalFile {
    return { name, path: `${this.path}/${name}`, size: bytes.byteLength, modifiedAt };
  }
}
