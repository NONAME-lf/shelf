import { extensionOf, sha256Hex, type FileEntryDto, type SyncApi, type UploadResult } from '@shelf/shared';

/**
 * In-memory REST API with the server's "same name = new version" rule. Server times are in the past.
 * Mirrors `FakeServer` in `packages/shared/src/sync/syncEngine.test.ts` (shared test helpers are not exported).
 */
export class FakeApi implements SyncApi {
  readonly files = new Map<string, { entry: FileEntryDto; bytes: Uint8Array }>();
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
    return [...this.files.values()].map((file) => ({ ...file.entry }));
  }

  async upload(name: string, data: Blob | Uint8Array): Promise<UploadResult> {
    const created = !this.files.has(name);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
    return { entry: await this.put(name, bytes, 'Артем'), created };
  }

  async download(id: string): Promise<Blob> {
    const file = [...this.files.values()].find((candidate) => candidate.entry.id === id);
    if (!file) throw new Error(`not found: ${id}`);
    return new Blob([new Uint8Array(file.bytes)]);
  }
}
