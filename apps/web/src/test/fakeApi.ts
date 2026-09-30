import { extensionOf, sha256Hex, type FileEntryDto, type SyncApi, type UploadResult } from '@shelf/shared';

/**
 * In-memory REST API with the server's "same name = new version" rule; server times are in the past.
 * Mirrors `FakeApi` in `apps/desktop/src/main/test/fakeApi.ts`, plus an outage switch and an upload gate.
 */
export class FakeApi implements SyncApi {
  readonly files = new Map<string, { entry: FileEntryDto; bytes: Uint8Array }>();
  uploads = 0;
  /** While set, every call rejects with this error — a server that is down. */
  failWith: Error | null = null;
  /** While set, every call waits for it; `waiting` counts the calls held back. */
  gate: Promise<void> | null = null;
  waiting = 0;
  private clock = Date.parse('2026-09-20T09:00:00.000Z');
  private sequence = 0;

  async put(name: string, content: string | Uint8Array, by = 'Артем'): Promise<FileEntryDto> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.clock += 60_000;
    const now = new Date(this.clock).toISOString();
    const existing = this.files.get(name)?.entry;
    const entry: FileEntryDto = {
      id: existing?.id ?? `srv-${++this.sequence}`,
      name,
      extension: extensionOf(name),
      size: bytes.byteLength,
      checksum: await sha256Hex(bytes),
      createdAt: existing?.createdAt ?? now,
      modifiedAt: now,
      uploadedBy: existing?.uploadedBy ?? by,
      editedBy: by,
    };
    this.files.set(name, { entry, bytes });
    return entry;
  }

  text(name: string): string | undefined {
    const file = this.files.get(name);
    return file ? new TextDecoder().decode(file.bytes) : undefined;
  }

  async listFiles(): Promise<FileEntryDto[]> {
    await this.enter();
    return [...this.files.values()].map((file) => ({ ...file.entry }));
  }

  async upload(name: string, data: Blob | Uint8Array): Promise<UploadResult> {
    await this.enter();
    this.uploads += 1;
    const created = !this.files.has(name);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
    return { entry: await this.put(name, bytes), created };
  }

  async download(id: string): Promise<Blob> {
    await this.enter();
    const file = [...this.files.values()].find((candidate) => candidate.entry.id === id);
    if (!file) throw new Error(`not found: ${id}`);
    return new Blob([new Uint8Array(file.bytes)]);
  }

  private async enter(): Promise<void> {
    if (this.gate) {
      this.waiting += 1;
      await this.gate;
      this.waiting -= 1;
    }
    if (this.failWith) throw this.failWith;
  }
}
