import { MAX_UPLOAD_MB } from '@shelf/shared';
import type { UploadOutcome } from './useFileListController';

/** The notice after an upload by button or by drop; null when nothing happened. */
export function describeUpload(outcome: UploadOutcome): string | null {
  const parts: string[] = [];
  if (outcome.uploaded > 0) parts.push(`Завантажено файлів: ${outcome.uploaded}`);
  if (outcome.rejected.length > 0) parts.push(`Більші за ${MAX_UPLOAD_MB} МБ і пропущені: ${outcome.rejected.join(', ')}`);
  if (outcome.errors.length > 0) parts.push(`Помилки: ${outcome.errors.join('; ')}`);
  return parts.length > 0 ? parts.join('. ') : null;
}
