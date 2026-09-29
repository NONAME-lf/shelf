import {
  createPreview,
  DEFAULT_COLUMNS,
  getVisibleFiles,
  SortDirection,
  splitBySize,
  toggleColumn,
  TypeFilter,
  type ColumnKey,
  type ColumnVisibility,
  type FileApiClient,
  type FileEntryDto,
} from '@shelf/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewState } from './PreviewDialog';

export type UploadOutcome = { uploaded: number; rejected: string[]; errors: string[] };

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function revoke(state: PreviewState | undefined): void {
  if (state?.status === 'ready' && state.result.kind === 'IMAGE') URL.revokeObjectURL(state.result.url);
}

/**
 * «control» FileListController (VOPC, spec §4) as a React hook:
 * holds files, direction = ASCENDING and filter = ALL_FILES, and derives
 * visibleFiles = filterByType(sortByName(files, direction), filter).
 */
export function useFileListController(api: FileApiClient | null) {
  const [files, setFiles] = useState<FileEntryDto[]>([]);
  const [direction, setDirection] = useState<SortDirection>(SortDirection.ASCENDING);
  const [filter, setFilter] = useState<TypeFilter>(TypeFilter.ALL_FILES);
  const [columns, setColumns] = useState<ColumnVisibility>(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: FileEntryDto; state: PreviewState } | null>(null);
  const previewRequest = useRef(0);

  const visibleFiles = useMemo(() => getVisibleFiles(files, direction, filter), [files, direction, filter]);

  const loadFiles = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      setFiles(await api.listFiles());
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const toggle = useCallback((key: ColumnKey) => setColumns((current) => toggleColumn(current, key)), []);

  const openPreview = useCallback(
    async (file: FileEntryDto) => {
      if (!api) return;
      const request = ++previewRequest.current;
      const renderer = createPreview(file);
      if (!renderer) {
        setPreview({ file, state: { status: 'unsupported' } });
        return;
      }
      setPreview({ file, state: { status: 'loading' } });
      try {
        const result = await renderer.render(await api.download(file.id));
        if (request === previewRequest.current) setPreview({ file, state: { status: 'ready', result } });
        else revoke({ status: 'ready', result });
      } catch (caught) {
        if (request === previewRequest.current) setPreview({ file, state: { status: 'error', message: messageOf(caught) } });
      }
    },
    [api],
  );

  const closePreview = useCallback(() => {
    previewRequest.current += 1;
    setPreview((current) => {
      revoke(current?.state);
      return null;
    });
  }, []);

  const upload = useCallback(
    async (picked: File[]): Promise<UploadOutcome> => {
      const outcome: UploadOutcome = { uploaded: 0, rejected: [], errors: [] };
      if (!api) return outcome;
      const { accepted, rejected } = splitBySize(picked);
      outcome.rejected = rejected.map((file) => file.name);
      for (const file of accepted) {
        try {
          await api.upload(file.name, file);
          outcome.uploaded += 1;
        } catch (caught) {
          outcome.errors.push(`${file.name}: ${messageOf(caught)}`);
        }
      }
      if (outcome.uploaded > 0) await loadFiles();
      return outcome;
    },
    [api, loadFiles],
  );

  const remove = useCallback(
    async (file: FileEntryDto) => {
      if (!api) return;
      await api.remove(file.id);
      await loadFiles();
    },
    [api, loadFiles],
  );

  return {
    files,
    visibleFiles,
    direction,
    setDirection,
    filter,
    setFilter,
    columns,
    toggleColumn: toggle,
    loading,
    error,
    setError,
    loadFiles,
    preview,
    openPreview,
    closePreview,
    upload,
    remove,
  };
}

export type FileListController = ReturnType<typeof useFileListController>;
