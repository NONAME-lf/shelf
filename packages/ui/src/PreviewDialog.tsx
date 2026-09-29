import { formatDateTime, formatSize, type FileEntryDto, type PreviewResult } from '@shelf/shared';
import { Download } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; result: PreviewResult }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export type PreviewDialogProps = {
  file: FileEntryDto | null;
  state: PreviewState | null;
  onClose: () => void;
  onDownload: (file: FileEntryDto) => void;
};

function PreviewBody({ state }: { state: PreviewState | null }) {
  if (!state || state.status === 'loading') return <p className="text-muted">Завантаження вмісту…</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-danger">
        {state.message}
      </p>
    );
  }
  if (state.status === 'unsupported') {
    return (
      <p data-testid="preview-unsupported" className="rounded-md bg-paper-2 px-3 py-6 text-center text-muted">
        Перегляд недоступний для цього типу файлу
      </p>
    );
  }
  const { result } = state;
  if (result.kind === 'TEXT') {
    return (
      <>
        <pre data-testid="preview-text" className="max-h-[50vh] overflow-auto rounded-md bg-ink p-4 font-mono text-[13px] leading-relaxed text-paper">
          {result.text}
        </pre>
        {result.truncated ? <p className="mt-2 text-xs text-muted">Показано перший мегабайт файлу.</p> : null}
      </>
    );
  }
  return (
    <div className="flex justify-center rounded-md bg-paper-2 p-4">
      <img data-testid="preview-image" src={result.url} alt="" className="max-h-[55vh] max-w-full object-contain" />
    </div>
  );
}

/** UC8: .kt as text, .jpg as image; other types — attributes only. */
export function PreviewDialog({ file, state, onClose, onDownload }: PreviewDialogProps) {
  return (
    <Modal
      open={file !== null}
      title={file?.name ?? ''}
      onClose={onClose}
      wide
      testId="preview-dialog"
      footer={
        file ? (
          <>
            <Button onClick={() => onDownload(file)}>
              <Download size={16} /> Скачати
            </Button>
            <Button variant="primary" onClick={onClose}>
              Закрити
            </Button>
          </>
        ) : null
      }
    >
      {file ? (
        <>
          <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Розмір</dt>
            <dd>{formatSize(file.size)}</dd>
            <dt className="text-muted">Дата створення</dt>
            <dd>{formatDateTime(file.createdAt)}</dd>
            <dt className="text-muted">Дата зміни</dt>
            <dd>{formatDateTime(file.modifiedAt)}</dd>
            <dt className="text-muted">Хто завантажив</dt>
            <dd>{file.uploadedBy}</dd>
            <dt className="text-muted">Хто редагував</dt>
            <dd>{file.editedBy}</dd>
          </dl>
          <PreviewBody state={state} />
        </>
      ) : null}
    </Modal>
  );
}
