import { Upload } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from './Button';

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

/** UC9b: drop files from the OS onto the list. Internal drags (a row dragged out) are ignored. */
export function UploadDropzone({ onFiles, disabled, children }: { onFiles: (files: File[]) => void; disabled?: boolean; children: ReactNode }) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className="relative min-h-full"
      data-testid="dropzone"
      data-active={active}
      onDragEnter={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {active ? (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brass bg-brass-soft/85 text-lg font-medium text-brass-2">
          <Upload /> Відпустіть файли, щоб завантажити їх у простір
        </div>
      ) : null}
    </div>
  );
}

/** UC9a: choose files with the system dialog. */
export function UploadButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="primary" disabled={disabled} onClick={() => input.current?.click()} data-testid="upload-button">
        <Upload size={16} /> Завантажити
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="upload-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
