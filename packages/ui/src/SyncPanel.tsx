import type { SyncReport } from '@shelf/shared';
import { FolderSync, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { SyncReportView } from './SyncReportView';

export type SyncBusy = 'idle' | 'scanning' | 'syncing';

export type SyncPanelProps = {
  folderPath: string | null;
  busy: SyncBusy;
  progress: { done: number; total: number } | null;
  lastSyncedAt: string | null;
  lastReport: SyncReport | null;
  error: string | null;
  onChooseFolder: () => void;
  onSync: () => void;
  /** Automatic tracking (UC14a) — the desktop client only. */
  watch?: { enabled: boolean; onChange: (enabled: boolean) => void } | null;
  /** Shown instead of the controls when the platform cannot synchronize. */
  unsupportedReason?: string | null;
};

/** UC13 + UC14: bound folder, «Синхронізувати», automatic tracking, last report. */
export function SyncPanel(props: SyncPanelProps) {
  const { folderPath, busy, progress, lastSyncedAt, lastReport, error, onChooseFolder, onSync, watch, unsupportedReason } = props;
  return (
    <div className="space-y-3 text-sm" data-testid="sync-panel">
      <div>
        <div className="text-xs text-paper/60">Локальна папка</div>
        <div className="flex items-center gap-2">
          <FolderSync size={16} className="shrink-0 text-brass" />
          <span className="truncate" title={folderPath ?? ''} data-testid="sync-folder">
            {folderPath ?? "Не прив'язано"}
          </span>
        </div>
      </div>

      {unsupportedReason ? (
        <p className="text-paper/70">{unsupportedReason}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button size="sm" onClick={onChooseFolder} disabled={busy !== 'idle'}>
              {folderPath ? 'Змінити' : 'Обрати папку'}
            </Button>
            <Button size="sm" variant="primary" onClick={onSync} disabled={busy !== 'idle'} data-testid="sync-run" className="flex-1">
              <RefreshCw size={14} className={cn(busy !== 'idle' && 'animate-spin')} /> Синхронізувати
            </Button>
          </div>

          {watch ? (
            <label className="flex items-center gap-2 text-paper/90">
              <input
                type="checkbox"
                className="accent-brass"
                checked={watch.enabled}
                disabled={!folderPath}
                onChange={(event) => watch.onChange(event.target.checked)}
                data-testid="sync-watch"
              />
              Відстежувати зміни автоматично
            </label>
          ) : null}

          {busy === 'syncing' && progress ? (
            <div>
              <div className="mb-1 text-xs text-paper/70">
                Синхронізація: {progress.done} з {progress.total}
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-ink-3">
                <div className="h-full bg-brass transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded bg-danger/25 px-2 py-1 text-red-200">
              {error}
            </p>
          ) : null}

          {lastReport ? <SyncReportView report={lastReport} syncedAt={lastSyncedAt} compact /> : null}
        </>
      )}
    </div>
  );
}
