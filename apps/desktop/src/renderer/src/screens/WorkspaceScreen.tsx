import { MAX_UPLOAD_MB, type FileEntryDto } from '@shelf/shared';
import {
  Banner,
  Button,
  ColumnPicker,
  ConflictDialog,
  FileTableView,
  messageOf,
  PreviewDialog,
  SidebarSection,
  SyncPanel,
  TypeFilterControl,
  UploadButton,
  UploadDropzone,
  useFileListController,
  WorkspaceLayout,
  type UploadOutcome,
} from '@shelf/ui';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DesktopSettings } from '../../../shared/ipc';
import { cleanIpcError } from '../ipcError';
import { makeApi, type StoredSession } from '../session';
import { useDesktopSync } from '../sync/useDesktopSync';

type Props = {
  session: StoredSession;
  settings: DesktopSettings;
  onSettings: (settings: DesktopSettings) => void;
  onLogout: () => Promise<void>;
};

function describeUpload(outcome: UploadOutcome): string | null {
  const parts: string[] = [];
  if (outcome.uploaded > 0) parts.push(`Завантажено файлів: ${outcome.uploaded}`);
  if (outcome.rejected.length > 0) parts.push(`Більші за ${MAX_UPLOAD_MB} МБ і пропущені: ${outcome.rejected.join(', ')}`);
  if (outcome.errors.length > 0) parts.push(`Помилки: ${outcome.errors.join('; ')}`);
  return parts.length > 0 ? parts.join('. ') : null;
}

export function WorkspaceScreen({ session, settings, onSettings, onLogout }: Props) {
  const api = useMemo(() => makeApi(session.serverUrl, session.token, () => void onLogout()), [session, onLogout]);
  const list = useFileListController(api);
  const sync = useDesktopSync({ settings, onSettings, onSynced: list.loadFiles });
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  // True from the moment a row is dragged out of the window until the native drag is over. Chromium
  // then sees a drag that carries Files, which must not open the upload overlay.
  const [outgoingDrag, setOutgoingDrag] = useState(false);

  useEffect(() => {
    if (!outgoingDrag) return;
    const clear = () => setOutgoingDrag(false);
    // the native drag suppresses pointer events; before it starts the button is still pressed
    const onMove = (event: PointerEvent) => {
      if (event.buttons === 0) clear();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', clear);
      window.removeEventListener('blur', clear);
    };
  }, [outgoingDrag]);

  const upload = async (files: File[]) => {
    try {
      const outcome = await list.upload(files);
      const text = describeUpload(outcome);
      setNotice(text ? { text, tone: outcome.errors.length > 0 ? 'error' : 'info' } : null);
    } catch (caught) {
      setNotice({ text: messageOf(caught), tone: 'error' });
    }
  };

  // a scanned plan must not outlive the session
  const logout = async () => {
    if (sync.conflicts) await sync.cancel();
    await onLogout();
  };

  const download = async (file: FileEntryDto) => {
    try {
      await window.shelf.saveAs(file);
    } catch (caught) {
      list.setError(cleanIpcError(caught));
    }
  };

  const remove = async (file: FileEntryDto) => {
    if (!window.confirm(`Видалити «${file.name}» з простору?`)) return;
    try {
      await list.remove(file);
    } catch (caught) {
      setNotice({ text: messageOf(caught), tone: 'error' });
    }
  };

  return (
    <>
      <WorkspaceLayout
        user={session.user}
        onLogout={() => void logout()}
        sidebar={
          <>
            <SidebarSection title="Синхронізація">
              <SyncPanel
                folderPath={settings.folderPath}
                busy={sync.busy}
                progress={sync.progress}
                lastSyncedAt={sync.lastSyncedAt}
                lastReport={sync.lastReport}
                error={sync.error}
                onChooseFolder={() => void sync.chooseFolder()}
                onSync={() => void sync.sync()}
                watch={{ enabled: settings.watch, onChange: (enabled) => void sync.setWatch(enabled) }}
              />
            </SidebarSection>
            <SidebarSection title="Стовпці таблиці">
              <ColumnPicker columns={list.columns} onToggle={list.toggleColumn} />
            </SidebarSection>
          </>
        }
        toolbar={
          <>
            <TypeFilterControl filter={list.filter} onFilterSelect={list.setFilter} />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted" data-testid="file-count">
                {list.visibleFiles.length} з {list.files.length}
              </span>
              <Button onClick={() => void list.loadFiles()} disabled={list.loading}>
                <RefreshCw size={16} /> Оновити
              </Button>
              <UploadButton onFiles={(files) => void upload(files)} />
            </div>
          </>
        }
      >
        <UploadDropzone onFiles={(files) => void upload(files)} disabled={outgoingDrag}>
          {notice ? (
            <Banner tone={notice.tone} onClose={() => setNotice(null)}>
              {notice.text}
            </Banner>
          ) : null}
          {list.error ? (
            <Banner tone="error" onClose={() => list.setError(null)}>
              {list.error}
            </Banner>
          ) : null}
          <FileTableView
            files={list.visibleFiles}
            columns={list.columns}
            direction={list.direction}
            onDirectionChange={list.setDirection}
            onOpen={(file) => void list.openPreview(file)}
            onDownload={(file) => void download(file)}
            onDelete={(file) => void remove(file)}
            onRowPointerDown={(file) => void window.shelf.prepareDrag(file).catch(() => undefined)}
            onRowDragStart={(file, event) => {
              event.preventDefault();
              setOutgoingDrag(true);
              window.shelf.startDrag(file).catch((caught) => setNotice({ text: cleanIpcError(caught), tone: 'error' }));
            }}
            emptyText={
              list.loading
                ? 'Завантаження…'
                : 'У просторі ще немає файлів. Перетягніть їх сюди або натисніть «Завантажити».'
            }
          />
        </UploadDropzone>
      </WorkspaceLayout>

      <PreviewDialog
        file={list.preview?.file ?? null}
        state={list.preview?.state ?? null}
        onClose={list.closePreview}
        onDownload={(file) => void download(file)}
      />
      <ConflictDialog items={sync.conflicts} onConfirm={(resolutions) => void sync.confirm(resolutions)} onCancel={() => void sync.cancel()} />
    </>
  );
}
