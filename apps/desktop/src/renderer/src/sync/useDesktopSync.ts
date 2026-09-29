import { SyncStatus, type Side, type SyncItem, type SyncProgress, type SyncReport } from '@shelf/shared';
import type { SyncBusy } from '@shelf/ui';
import { useCallback, useEffect, useState } from 'react';
import type { DesktopSettings } from '../../../shared/ipc';
import { cleanIpcError } from '../ipcError';

type Options = {
  settings: DesktopSettings;
  onSettings: (settings: DesktopSettings) => void;
  onSynced: () => Promise<void> | void;
};

/** UC13 + UC14 in the renderer: asks the main process to scan, shows conflicts, runs the plan. */
export function useDesktopSync({ settings, onSettings, onSynced }: Options) {
  const [busy, setBusy] = useState<SyncBusy>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept in state so the array identity is stable: ConflictDialog seeds its choices from it in an effect.
  const [conflicts, setConflicts] = useState<SyncItem[] | null>(null);

  useEffect(() => {
    const offProgress = window.shelf.onProgress(setProgress);
    const offAuto = window.shelf.onAutoSync((event) => {
      setError(event.error);
      const { report } = event;
      if (report) {
        // a follow-up run that changed nothing must not replace the report the user is looking at
        if (report.uploaded + report.downloaded > 0 || report.errors.length > 0) setLastReport(report);
        setLastSyncedAt(event.syncedAt);
        void onSynced();
      }
    });
    return () => {
      offProgress();
      offAuto();
    };
  }, [onSynced]);

  const run = useCallback(
    async (resolutions: Record<string, Side>) => {
      setBusy('syncing');
      setProgress(null);
      try {
        const result = await window.shelf.run(resolutions);
        setLastReport(result.report);
        setLastSyncedAt(result.syncedAt);
        await onSynced();
      } catch (caught) {
        setError(cleanIpcError(caught));
      } finally {
        setBusy('idle');
        setProgress(null);
      }
    },
    [onSynced],
  );

  const sync = useCallback(async () => {
    setError(null);
    let current = settings;
    if (!current.folderPath) {
      try {
        current = await window.shelf.chooseFolder();
      } catch (caught) {
        setError(cleanIpcError(caught));
        return;
      }
      onSettings(current);
      if (!current.folderPath) return;
    }
    setBusy('scanning');
    try {
      const found = (await window.shelf.scan()).filter((item) => item.status === SyncStatus.CONFLICT);
      if (found.length > 0) {
        setConflicts(found);
        setBusy('idle');
        return;
      }
    } catch (caught) {
      setError(cleanIpcError(caught));
      setBusy('idle');
      return;
    }
    await run({});
  }, [settings, onSettings, run]);

  const confirm = useCallback(
    async (resolutions: Record<string, Side>) => {
      setConflicts(null);
      await run(resolutions);
    },
    [run],
  );

  /** Drops the scanned plan (dialog cancel, Escape, logout, folder change) and lets automatic tracking resume. */
  const cancel = useCallback(async () => {
    setConflicts(null);
    try {
      await window.shelf.cancel();
    } catch (caught) {
      setError(cleanIpcError(caught));
    }
  }, []);

  const chooseFolder = useCallback(async () => {
    try {
      if (conflicts) await cancel();
      onSettings(await window.shelf.chooseFolder());
    } catch (caught) {
      setError(cleanIpcError(caught));
    }
  }, [conflicts, cancel, onSettings]);

  const setWatch = useCallback(
    async (enabled: boolean) => {
      try {
        onSettings(await window.shelf.setWatch(enabled));
      } catch (caught) {
        setError(cleanIpcError(caught));
      }
    },
    [onSettings],
  );

  return { busy, progress, lastReport, lastSyncedAt, error, conflicts, sync, confirm, cancel, chooseFolder, setWatch };
}
