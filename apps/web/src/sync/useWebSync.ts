'use client';

import { accountKey, SyncStatus, type Side, type SyncApi, type SyncItem, type SyncProgress, type SyncReport } from '@shelf/shared';
import { messageOf, type SyncBusy } from '@shelf/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../lib/config';
import { explainBrowserError } from './browserErrors';
import { directoryPicker } from './fileSystemAccess';
import { FolderBindingStore } from './folderBindingStore';
import { shelfDb } from './idb';
import { IndexedDbSnapshotStore } from './indexedDbSnapshotStore';
import { WebSyncService, type AutoSyncEvent, type WebSyncState } from './webSyncService';

export const UNSUPPORTED_REASON =
  'Синхронізація з локальною папкою працює в Chrome і Edge (потрібен File System Access API). У цьому браузері доступні перегляд, завантаження, скачування і видалення файлів.';

type Options = { api: SyncApi; userId: string; onSynced: () => Promise<void> | void };

/** UC13 + UC14 in the browser — the web counterpart of the desktop's useDesktopSync. */
export function useWebSync({ api, userId, onSynced }: Options) {
  const [state, setState] = useState<WebSyncState>({ folderName: null, watch: false });
  const [busy, setBusy] = useState<SyncBusy>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept in state so the array identity is stable: ConflictDialog seeds its choices from it in an effect.
  const [conflicts, setConflicts] = useState<SyncItem[] | null>(null);
  const synced = useRef(onSynced);
  // The saved binding is read asynchronously; a click before it arrives must wait for it, otherwise it
  // would open the picker for an account that already has a folder and orphan its stored snapshot.
  const signedIn = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    synced.current = onSynced;
  }, [onSynced]);

  // This hook runs only in the browser (the workspace renders after the session was read), so the
  // feature check and IndexedDB are safe in the initializer. Without the API there is no service.
  const [service] = useState<WebSyncService | null>(() => {
    const picker = directoryPicker();
    if (!picker) return null;
    const open = shelfDb();
    return new WebSyncService({
      bindings: new FolderBindingStore(open),
      snapshots: new IndexedDbSnapshotStore(open),
      pickFolder: () => picker({ id: 'shelf-sync', mode: 'readwrite' }),
      onProgress: setProgress,
      onAutoSync: (event: AutoSyncEvent) => {
        setError(event.error);
        const { report } = event;
        if (!report) return;
        // a follow-up run that changed nothing must not replace the report the user is looking at
        if (report.uploaded + report.downloaded > 0 || report.errors.length > 0 || report.conflicts > 0) setLastReport(report);
        setLastSyncedAt(event.syncedAt);
        void synced.current();
      },
    });
  });

  useEffect(() => {
    if (!service) return;
    let active = true;
    signedIn.current = service.setSession({ account: accountKey(API_URL, userId), api }).then(
      (next) => {
        if (active) setState(next);
      },
      (caught: unknown) => {
        if (active) setError(messageOf(caught));
      },
    );
    return () => {
      active = false;
      // polling and a scanned plan must not outlive the screen (logout, another account)
      void service.setSession(null);
    };
  }, [service, api, userId]);

  const run = useCallback(
    async (resolutions: Record<string, Side>) => {
      if (!service) return;
      setBusy('syncing');
      setProgress(null);
      try {
        const result = await service.run(resolutions);
        setLastReport(result.report);
        setLastSyncedAt(result.syncedAt);
        await synced.current();
      } catch (caught) {
        setError(messageOf(caught));
      } finally {
        setBusy('idle');
        setProgress(null);
      }
    },
    [service],
  );

  const sync = useCallback(async () => {
    if (!service) return;
    setError(null);
    // busy from the first click: the buttons stay disabled while the picker or a permission prompt is open
    setBusy('scanning');
    try {
      await signedIn.current;
      if (!service.state().folderName) {
        const next = await service.chooseFolder();
        setState(next);
        if (!next.folderName) {
          setBusy('idle');
          return;
        }
      }
      const found = (await service.scan()).filter((item) => item.status === SyncStatus.CONFLICT);
      if (found.length > 0) {
        setConflicts(found);
        setBusy('idle');
        return;
      }
    } catch (caught) {
      setError(messageOf(explainBrowserError(caught, service.state().folderName ?? 'обрану')));
      setBusy('idle');
      return;
    }
    await run({});
  }, [service, run]);

  const confirm = useCallback(
    async (resolutions: Record<string, Side>) => {
      setConflicts(null);
      await run(resolutions);
    },
    [run],
  );

  /** Drops the scanned plan (dialog cancel, Escape, logout, folder change) and lets automatic tracking resume. */
  const cancel = useCallback(() => {
    setConflicts(null);
    service?.cancel();
  }, [service]);

  const chooseFolder = useCallback(async () => {
    if (!service) return;
    setError(null);
    setBusy('scanning');
    try {
      await signedIn.current;
      const before = service.state().folderName;
      const next = await service.chooseFolder();
      // the service drops its plan on a new choice; close the dialog with it (a dismissed picker changes nothing)
      if (next.folderName !== before) setConflicts(null);
      setState(next);
    } catch (caught) {
      setError(messageOf(explainBrowserError(caught, service.state().folderName ?? 'обрану')));
    } finally {
      setBusy('idle');
    }
  }, [service]);

  const setWatch = useCallback(
    async (enabled: boolean) => {
      if (!service) return;
      setError(null);
      try {
        setState(await service.setWatch(enabled));
      } catch (caught) {
        setError(messageOf(caught));
      }
    },
    [service],
  );

  return {
    supported: service !== null,
    state,
    busy,
    progress,
    lastReport,
    lastSyncedAt,
    error,
    conflicts,
    sync,
    confirm,
    cancel,
    chooseFolder,
    setWatch,
  };
}
