import { contentDisposition, contentTypeFor, decodeUploadName } from './content-type';

describe('contentTypeFor', () => {
  it.each([
    ['Main.kt', 'text/plain; charset=utf-8'],
    ['main.cpp', 'text/plain; charset=utf-8'],
    ['photo.jpg', 'image/jpeg'],
    ['PHOTO.JPEG', 'image/jpeg'],
    ['logo.png', 'image/png'],
    ['backup.zip', 'application/octet-stream'],
  ])('%s → %s', (name, type) => {
    expect(contentTypeFor(name)).toBe(type);
  });
});

describe('contentDisposition', () => {
  it('keeps an ASCII fallback and the exact UTF-8 name (RFC 5987)', () => {
    expect(contentDisposition('Звіт 1.txt')).toBe(
      `attachment; filename="____ 1.txt"; filename*=UTF-8''%D0%97%D0%B2%D1%96%D1%82%201.txt`,
    );
  });

  it('neutralises quotes in the fallback', () => {
    expect(contentDisposition('a"b.txt')).toBe(`attachment; filename="a_b.txt"; filename*=UTF-8''a%22b.txt`);
  });
});

describe('decodeUploadName', () => {
  it('repairs a UTF-8 name that multer decoded as latin1', () => {
    const garbled = Buffer.from('Звіт.txt', 'utf8').toString('latin1');
    expect(decodeUploadName(garbled)).toBe('Звіт.txt');
  });

  it('keeps an ASCII name', () => {
    expect(decodeUploadName('Main.kt')).toBe('Main.kt');
  });

  it('keeps a name that is already decoded', () => {
    expect(decodeUploadName('Звіт.txt')).toBe('Звіт.txt');
  });
});
