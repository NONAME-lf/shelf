import { extensionOf, previewKindOf, PreviewKind } from '@shelf/shared';

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export function contentTypeFor(name: string): string {
  const imageType = IMAGE_TYPES[extensionOf(name)];
  if (imageType) return imageType;
  if (previewKindOf(name) === PreviewKind.TEXT) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

/** attachment with an ASCII fallback name and the exact UTF-8 name (RFC 5987 / RFC 6266). */
export function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * multer (busboy) decodes the multipart file name as latin1, so a UTF-8 name like "Звіт.txt"
 * arrives as "Ð\u0097Ð²Ñ\u0096Ñ\u0082.txt". Re-reads those bytes as UTF-8; a name that is already
 * decoded (has characters above U+00FF) or is not valid UTF-8 is returned unchanged.
 */
export function decodeUploadName(raw: string): string {
  if ([...raw].some((char) => char.charCodeAt(0) > 0xff)) return raw;
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}
