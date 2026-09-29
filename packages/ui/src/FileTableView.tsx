import {
  COLUMN_LABELS,
  formatDateTime,
  formatSize,
  previewKindOf,
  PreviewKind,
  visibleColumns,
  type ColumnKey,
  type ColumnVisibility,
  type FileEntryDto,
  type SortDirection,
} from '@shelf/shared';
import { Download, File as GenericFileIcon, FileImage, FileText, Trash2 } from 'lucide-react';
import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { cn } from './cn';
import { SortHeaderControl } from './SortHeaderControl';

export type FileTableViewProps = {
  files: FileEntryDto[];
  columns: ColumnVisibility;
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
  onOpen: (file: FileEntryDto) => void;
  onDownload: (file: FileEntryDto) => void;
  onDelete: (file: FileEntryDto) => void;
  onRowPointerDown?: (file: FileEntryDto) => void;
  onRowDragStart?: (file: FileEntryDto, event: DragEvent<HTMLTableRowElement>) => void;
  emptyText?: string;
};

function FileIcon({ name }: { name: string }) {
  const kind = previewKindOf(name);
  const Icon = kind === PreviewKind.TEXT ? FileText : kind === PreviewKind.IMAGE ? FileImage : GenericFileIcon;
  return <Icon size={16} className="shrink-0 text-muted" />;
}

function cell(file: FileEntryDto, key: ColumnKey): ReactNode {
  switch (key) {
    case 'name':
      return (
        <span className="inline-flex items-center gap-2 font-medium">
          <FileIcon name={file.name} />
          {file.name}
        </span>
      );
    case 'extension':
      return file.extension ? <code className="rounded bg-paper-2 px-1.5 py-0.5 text-xs">.{file.extension}</code> : '—';
    case 'size':
      return formatSize(file.size);
    case 'createdAt':
      return formatDateTime(file.createdAt);
    case 'modifiedAt':
      return formatDateTime(file.modifiedAt);
    case 'uploadedBy':
      return file.uploadedBy;
    case 'editedBy':
      return file.editedBy;
  }
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: (event: MouseEvent) => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn('rounded p-1.5 text-muted hover:bg-white', danger ? 'hover:text-danger' : 'hover:text-ink')}
    >
      {children}
    </button>
  );
}

/** «boundary» FileTableView: renders the visible files with the chosen columns (UC4). */
export function FileTableView(props: FileTableViewProps) {
  const { files, columns, direction, onDirectionChange, onOpen, onDownload, onDelete, onRowPointerDown, onRowDragStart } = props;
  const shown = visibleColumns(columns);

  return (
    <table className="w-full border-collapse text-sm" data-testid="file-table">
      <thead className="sticky top-0 z-10 bg-paper-2 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          {shown.map((key) => (
            <th key={key} className="whitespace-nowrap px-4 py-2 font-semibold">
              {key === 'name' ? <SortHeaderControl direction={direction} onDirectionChange={onDirectionChange} /> : COLUMN_LABELS[key]}
            </th>
          ))}
          <th className="w-24 px-4 py-2 text-right font-semibold">Дії</th>
        </tr>
      </thead>
      <tbody>
        {files.length === 0 ? (
          <tr>
            <td colSpan={shown.length + 1} className="px-4 py-16 text-center text-muted">
              {props.emptyText ?? 'Файлів немає'}
            </td>
          </tr>
        ) : (
          files.map((file) => (
            <tr
              key={file.id}
              data-testid="file-row"
              data-name={file.name}
              draggable={Boolean(onRowDragStart)}
              onPointerDown={(event) => {
                if (event.button === 0) onRowPointerDown?.(file);
              }}
              onDragStart={(event) => onRowDragStart?.(file, event)}
              onClick={() => onOpen(file)}
              className="cursor-pointer border-b border-line/70 odd:bg-white even:bg-paper/60 hover:bg-brass-soft/60"
            >
              {shown.map((key) => (
                <td key={key} className="whitespace-nowrap px-4 py-2 align-middle">
                  {cell(file, key)}
                </td>
              ))}
              <td className="px-4 py-1 text-right">
                <div className="inline-flex gap-1">
                  <IconButton
                    label="Скачати"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownload(file);
                    }}
                  >
                    <Download size={16} />
                  </IconButton>
                  <IconButton
                    label="Видалити"
                    danger
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(file);
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
