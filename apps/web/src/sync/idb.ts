export const DB_NAME = 'shelf';
export const DB_VERSION = 1;
export const SNAPSHOTS = 'snapshots';
export const BINDINGS = 'bindings';

/** Opens the client's database; every store takes one of these so tests can pass fake-indexeddb. */
export type OpenDb = () => Promise<IDBDatabase>;

function openShelfDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'folderPath' });
      if (!db.objectStoreNames.contains(BINDINGS)) db.createObjectStore(BINDINGS, { keyPath: 'account' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One connection per page, opened on first use; a failed open is retried by the next call. */
export function shelfDb(factory: IDBFactory = indexedDB): OpenDb {
  let db: Promise<IDBDatabase> | null = null;
  return () => {
    db ??= openShelfDb(factory).catch((error: unknown) => {
      db = null;
      throw error;
    });
    return db;
  };
}

/** Runs one request in its own transaction and resolves once the transaction has committed. */
export async function inStore<T>(
  open: OpenDb,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB: транзакцію скасовано'));
  });
}
