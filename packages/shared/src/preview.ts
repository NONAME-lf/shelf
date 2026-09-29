import { extensionOf } from './fileListOperations';
import { PreviewKind, type FileEntryDto } from './types';

/** Any text-like file is shown as text; `.kt` is the mandatory case of variant 8. */
const TEXT_EXTENSIONS = new Set([
  'kt', 'kts', 'txt', 'md', 'json', 'cpp', 'c', 'h', 'hpp', 'cs', 'java', 'py', 'js', 'ts', 'tsx', 'jsx',
  'css', 'html', 'xml', 'yml', 'yaml', 'csv', 'log', 'sql', 'sh', 'ini', 'toml',
]);

/** Any raster image is shown as an image; `.jpg` is the mandatory case of variant 8. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

export const MAX_TEXT_PREVIEW_BYTES = 1_000_000;

export function previewKindOf(name: string): PreviewKind {
  const extension = extensionOf(name);
  if (TEXT_EXTENSIONS.has(extension)) return PreviewKind.TEXT;
  if (IMAGE_EXTENSIONS.has(extension)) return PreviewKind.IMAGE;
  return PreviewKind.NONE;
}

export type PreviewResult = { kind: 'TEXT'; text: string; truncated: boolean } | { kind: 'IMAGE'; url: string };

export abstract class FilePreview {
  abstract readonly kind: PreviewKind;

  constructor(readonly entry: Pick<FileEntryDto, 'name'>) {}

  canRender(extension: string): boolean {
    return previewKindOf(`file.${extension}`) === this.kind;
  }

  abstract render(content: Blob): Promise<PreviewResult>;
}

export class TextPreview extends FilePreview {
  readonly kind = PreviewKind.TEXT;
  readonly encoding = 'utf-8';

  async render(content: Blob): Promise<PreviewResult> {
    const truncated = content.size > MAX_TEXT_PREVIEW_BYTES;
    const text = await (truncated ? content.slice(0, MAX_TEXT_PREVIEW_BYTES) : content).text();
    return { kind: 'TEXT', text, truncated };
  }
}

export class ImagePreview extends FilePreview {
  readonly kind = PreviewKind.IMAGE;
  width: number | null = null;
  height: number | null = null;

  async render(content: Blob): Promise<PreviewResult> {
    if (typeof globalThis.createImageBitmap === 'function') {
      try {
        const bitmap = await globalThis.createImageBitmap(content);
        this.width = bitmap.width;
        this.height = bitmap.height;
        bitmap.close();
      } catch {
        // The size is informational; a browser that cannot decode the image still shows it via <img>.
      }
    }
    return { kind: 'IMAGE', url: URL.createObjectURL(content) };
  }
}

export function createPreview(entry: Pick<FileEntryDto, 'name'>): FilePreview | null {
  switch (previewKindOf(entry.name)) {
    case PreviewKind.TEXT:
      return new TextPreview(entry);
    case PreviewKind.IMAGE:
      return new ImagePreview(entry);
    default:
      return null;
  }
}
