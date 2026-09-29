import { describe, expect, it } from 'vitest';
import { createPreview, ImagePreview, MAX_TEXT_PREVIEW_BYTES, previewKindOf, TextPreview } from './preview';
import { PreviewKind } from './types';

describe('previewKindOf — тип варіанта: .kt як текст, .jpg як зображення', () => {
  it.each([
    ['Main.kt', PreviewKind.TEXT],
    ['photo.jpg', PreviewKind.IMAGE],
    ['PHOTO.JPG', PreviewKind.IMAGE],
    ['main.cpp', PreviewKind.TEXT],
    ['notes.txt', PreviewKind.TEXT],
    ['logo.png', PreviewKind.IMAGE],
    ['backup.zip', PreviewKind.NONE],
    ['noext', PreviewKind.NONE],
  ])('%s → %s', (name, kind) => {
    expect(previewKindOf(name)).toBe(kind);
  });
});

describe('createPreview', () => {
  it('creates a TextPreview for .kt', () => {
    expect(createPreview({ name: 'Main.kt' })).toBeInstanceOf(TextPreview);
  });

  it('creates an ImagePreview for .jpg', () => {
    expect(createPreview({ name: 'photo.jpg' })).toBeInstanceOf(ImagePreview);
  });

  it('returns null for types without a preview', () => {
    expect(createPreview({ name: 'backup.zip' })).toBeNull();
  });
});

describe('TextPreview', () => {
  it('renders UTF-8 text', async () => {
    const preview = new TextPreview({ name: 'Main.kt' });
    const result = await preview.render(new Blob(['fun main() = println("Привіт")']));
    expect(result).toEqual({ kind: 'TEXT', text: 'fun main() = println("Привіт")', truncated: false });
  });

  it('shows only the first megabyte of a large file', async () => {
    const preview = new TextPreview({ name: 'log.txt' });
    const result = await preview.render(new Blob(['a'.repeat(MAX_TEXT_PREVIEW_BYTES + 10)]));
    expect(result.kind).toBe('TEXT');
    if (result.kind === 'TEXT') {
      expect(result.text).toHaveLength(MAX_TEXT_PREVIEW_BYTES);
      expect(result.truncated).toBe(true);
    }
  });

  it('can render any text extension', () => {
    const preview = new TextPreview({ name: 'Main.kt' });
    expect(preview.canRender('kt')).toBe(true);
    expect(preview.canRender('jpg')).toBe(false);
  });
});

describe('ImagePreview', () => {
  it('renders an object URL for the image bytes', async () => {
    const preview = new ImagePreview({ name: 'photo.jpg' });
    const result = await preview.render(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
    expect(result.kind).toBe('IMAGE');
    if (result.kind === 'IMAGE') expect(result.url.startsWith('blob:')).toBe(true);
  });
});
