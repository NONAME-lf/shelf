import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FolderBindingStore, type FolderBinding } from './folderBindingStore';
import { BINDINGS, inStore, shelfDb } from './idb';

const ARTEM = 'user-artem@http://localhost:4000/api';
const IRYNA = 'user-iryna@http://localhost:4000/api';
// structured cloning keeps a real FileSystemDirectoryHandle; a plain object stands in for it here
const handle = (name: string) => ({ kind: 'directory', name }) as unknown as FileSystemDirectoryHandle;
const binding = (account: string, name: string, watch = false): FolderBinding => ({ account, id: `id-${name}`, handle: handle(name), watch });

describe('FolderBindingStore', () => {
  it('keeps one folder and tracking flag per account', async () => {
    const factory = new IDBFactory();
    const store = new FolderBindingStore(shelfDb(factory));
    await store.put(binding(ARTEM, 'Shelf', true));

    const reopened = new FolderBindingStore(shelfDb(factory));
    expect(await reopened.get(ARTEM)).toEqual(binding(ARTEM, 'Shelf', true));
    expect(await reopened.get(IRYNA)).toBeNull();

    await reopened.put(binding(IRYNA, 'Iryna'));
    expect(await reopened.get(ARTEM)).toEqual(binding(ARTEM, 'Shelf', true));
    expect(await reopened.get(IRYNA)).toEqual(binding(IRYNA, 'Iryna'));
  });

  it('ignores a record without a handle', async () => {
    const open = shelfDb(new IDBFactory());
    await inStore(open, BINDINGS, 'readwrite', (store) => store.put({ account: ARTEM, id: 'id-1', watch: true }));
    expect(await new FolderBindingStore(open).get(ARTEM)).toBeNull();
  });
});
