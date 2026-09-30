'use client';

import type { FileEntryDto } from '@shelf/shared';
import {
  Banner,
  Button,
  ColumnPicker,
  describeUpload,
  FileTableView,
  messageOf,
  PreviewDialog,
  SidebarSection,
  TypeFilterControl,
  UploadButton,
  UploadDropzone,
  useFileListController,
  WorkspaceLayout,
} from '@shelf/ui';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { saveBlob } from '../lib/saveBlob';
import { makeApi, type StoredSession } from '../lib/session';

type Props = { session: StoredSession; onLogout: () => void };

export function WorkspaceScreen({ session, onLogout }: Props) {
  // a 401 from any request (an expired token) signs the user out
  const api = useMemo(() => makeApi(session.token, onLogout), [session.token, onLogout]);
  const list = useFileListController(api);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const upload = async (files: File[]) => {
    try {
      const outcome = await list.upload(files);
      const text = describeUpload(outcome);
      setNotice(text ? { text, tone: outcome.errors.length > 0 ? 'error' : 'info' } : null);
    } catch (caught) {
      setNotice({ text: messageOf(caught), tone: 'error' });
    }
  };

  // A plain link cannot carry the Authorization header: the bytes are fetched with the token, then saved.
  const download = async (file: FileEntryDto) => {
    try {
      saveBlob(await api.download(file.id), file.name);
    } catch (caught) {
      list.setError(messageOf(caught));
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
        onLogout={onLogout}
        sidebar={
          <SidebarSection title="Стовпці таблиці">
            <ColumnPicker columns={list.columns} onToggle={list.toggleColumn} />
          </SidebarSection>
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
        <UploadDropzone onFiles={(files) => void upload(files)}>
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
            emptyText={
              list.loading ? 'Завантаження…' : 'У просторі ще немає файлів. Перетягніть їх сюди або натисніть «Завантажити».'
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
    </>
  );
}
