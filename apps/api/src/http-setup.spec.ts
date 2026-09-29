import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  ValidationPipe,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RegisterBody } from './auth/dto';
import {
  UploadErrorFilter,
  createFileIdPipe,
  createValidationPipe,
  mapUploadError,
  FILE_NOT_FOUND_MESSAGE,
  FILE_TOO_LARGE_MESSAGE,
  UNEXPECTED_FILE_FIELD_MESSAGE,
} from './http-setup';

describe('createFileIdPipe', () => {
  const pipe = createFileIdPipe();
  const meta = { type: 'param' as const, metatype: String, data: 'id' };

  it('accepts a v4 uuid', async () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    await expect(pipe.transform(id, meta)).resolves.toBe(id);
  });

  it('turns a malformed id into a 404 with the file-not-found message', async () => {
    const error = await pipe.transform('not-a-uuid', meta).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(FILE_NOT_FOUND_MESSAGE);
  });
});

describe('global validation pipe', () => {
  const pipe: ValidationPipe = createValidationPipe();
  const meta = { type: 'body' as const, metatype: RegisterBody };
  const valid = { email: 'a@shelf.dev', password: 'long-enough', displayName: 'Артем' };
  const messageFor = async (body: unknown): Promise<string> => {
    const error = await pipe.transform(body, meta).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  };

  it('reports an unknown property in Ukrainian', async () => {
    expect(await messageFor({ ...valid, remember: true })).toBe('Невідоме поле «remember»');
  });

  it('reports a too long display name in Ukrainian', async () => {
    expect(await messageFor({ ...valid, displayName: 'x'.repeat(61) })).toBe("Ім'я задовге (найбільше 60 символів)");
  });

  it('reports a non-string display name in Ukrainian', async () => {
    expect(await messageFor({ ...valid, displayName: 42 })).toContain("Ім'я має бути рядком");
  });

  it('accepts a valid body', async () => {
    await expect(pipe.transform(plainToInstance(RegisterBody, valid), meta)).resolves.toMatchObject(valid);
  });
});

describe('upload error mapping', () => {
  it('maps multer 413 to the Ukrainian size message and keeps the status', () => {
    const mapped = mapUploadError(new PayloadTooLargeException('File too large'));
    expect(mapped.getStatus()).toBe(413);
    expect(mapped.message).toBe(FILE_TOO_LARGE_MESSAGE);
    expect(FILE_TOO_LARGE_MESSAGE).toBe('Файл більший за 50 МБ');
  });

  it('maps an unexpected multipart field to a Ukrainian 400', () => {
    const mapped = mapUploadError(new BadRequestException('Unexpected file field - other'));
    expect(mapped.getStatus()).toBe(400);
    expect(mapped.message).toBe(UNEXPECTED_FILE_FIELD_MESSAGE);
  });

  it.each([new BadRequestException('Файл не передано'), new ConflictException('Цей email уже зайнятий')])(
    'passes %p through unchanged',
    (exception) => {
      expect(mapUploadError(exception)).toBe(exception);
    },
  );

  it('the filter replies with the mapped exception', () => {
    const reply = jest.fn();
    const filter = new UploadErrorFilter({ reply, isHeadersSent: () => false } as never);
    const host = { getArgByIndex: (index: number) => (index === 1 ? 'res' : 'req') };

    filter.catch(new PayloadTooLargeException('File too large'), host as unknown as ArgumentsHost);

    expect(reply).toHaveBeenCalledWith(
      'res',
      expect.objectContaining({ statusCode: 413, message: FILE_TOO_LARGE_MESSAGE }),
      413,
    );
  });
});
