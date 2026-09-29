import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  NotFoundException,
  ParseUUIDPipe,
  PayloadTooLargeException,
  ValidationPipe,
  type INestApplication,
  type ValidationError,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { MAX_UPLOAD_MB } from '@shelf/shared';

export const FILE_NOT_FOUND_MESSAGE = 'Файл не знайдено';
export const FILE_TOO_LARGE_MESSAGE = `Файл більший за ${MAX_UPLOAD_MB} МБ`;
export const UNEXPECTED_FILE_FIELD_MESSAGE = 'Файл потрібно передати в полі «file»';
export const INVALID_REQUEST_MESSAGE = 'Некоректний запит';

/** Flattens class-validator errors (including nested ones) into Ukrainian text for the client. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages: string[] = [];
  const collect = (error: ValidationError): void => {
    const constraints = error.constraints ?? {};
    if ('whitelistValidation' in constraints) {
      messages.push(`Невідоме поле «${error.property}»`);
    } else {
      messages.push(...Object.values(constraints));
    }
    error.children?.forEach(collect);
  };
  errors.forEach(collect);
  return new BadRequestException(messages.join('; ') || INVALID_REQUEST_MESSAGE);
}

export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

/** A malformed file id cannot name any file, so it is reported like a missing one (404). */
export const createFileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new NotFoundException(FILE_NOT_FOUND_MESSAGE),
  });

/** Gives multer's English errors a Ukrainian message; every other exception passes through unchanged. */
@Catch(HttpException)
export class UploadErrorFilter extends BaseExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): void {
    super.catch(mapUploadError(exception), host);
  }
}

export function mapUploadError(exception: HttpException): HttpException {
  if (exception instanceof PayloadTooLargeException) return new PayloadTooLargeException(FILE_TOO_LARGE_MESSAGE);
  if (exception instanceof BadRequestException && exception.message.startsWith('Unexpected file field')) {
    return new BadRequestException(UNEXPECTED_FILE_FIELD_MESSAGE);
  }
  return exception;
}

/** The pipe and filter setup shared by main.ts and the tests. */
export function configureHttp(app: INestApplication): void {
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new UploadErrorFilter(app.get(HttpAdapterHost).httpAdapter));
}
