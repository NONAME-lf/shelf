import { BINDINGS, inStore, type OpenDb } from './idb';

/** The folder one account synchronizes with, and whether its changes are tracked automatically. */
export type FolderBinding = {
  /** `accountKey(API_URL, user.id)` from `@shelf/shared`. */
  account: string;
  /** Key of this folder's snapshot; kept when the same folder is chosen again. */
  id: string;
  handle: FileSystemDirectoryHandle;
  watch: boolean;
};

export interface FolderBindings {
  get(account: string): Promise<FolderBinding | null>;
  put(binding: FolderBinding): Promise<void>;
}

function isBinding(value: unknown, account: string): value is FolderBinding {
  const candidate = value as Partial<FolderBinding> | undefined;
  return candidate?.account === account && typeof candidate.id === 'string' && typeof candidate.handle === 'object' && candidate.handle !== null;
}

/**
 * Per-account folder bindings in IndexedDB (spec §5.1: "веб — handle у IndexedDB"). A directory handle
 * survives structured cloning, so the folder is remembered across reloads; its permission is not.
 */
export class FolderBindingStore implements FolderBindings {
  constructor(private readonly open: OpenDb) {}

  async get(account: string): Promise<FolderBinding | null> {
    const stored = await inStore<unknown>(this.open, BINDINGS, 'readonly', (store) => store.get(account));
    return isBinding(stored, account) ? { ...stored, watch: stored.watch === true } : null;
  }

  async put(binding: FolderBinding): Promise<void> {
    await inStore(this.open, BINDINGS, 'readwrite', (store) => store.put(binding));
  }
}
