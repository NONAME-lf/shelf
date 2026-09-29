import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES, type FileEntryDto } from '@shelf/shared';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { createFileIdPipe } from '../http-setup';
import { WorkspaceService } from '../workspace/workspace.service';
import { contentDisposition, contentTypeFor, decodeUploadName } from './content-type';
import { toFileEntryDto } from './file-entry.mapper';
import { FilesService } from './files.service';

/** `pipe` does not destroy its source when the client aborts, which would keep the S3 body and its socket open. */
export function releaseOnClose(response: Pick<Response, 'once'>, stream: Readable): void {
  response.once('close', () => {
    if (!stream.destroyed && !stream.readableEnded) stream.destroy();
  });
}

const FileId = () => Param('id', createFileIdPipe());

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspace/files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly workspaces: WorkspaceService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<FileEntryDto[]> {
    const workspace = await this.workspaces.forUser(user.id);
    return this.files.list(workspace.id);
  }

  /** 201 — a new file, 200 — a new version of the file with the same name. 413 above 50 MB. */
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FileEntryDto> {
    if (!file) throw new BadRequestException('Файл не передано (поле «file»)');
    const workspace = await this.workspaces.forUser(user.id);
    const result = await this.files.upsert(workspace.id, user, decodeUploadName(file.originalname), file.buffer);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.entry;
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @FileId() id: string): Promise<FileEntryDto> {
    const workspace = await this.workspaces.forUser(user.id);
    return toFileEntryDto(await this.files.get(workspace.id, id));
  }

  @Get(':id/content')
  async content(
    @CurrentUser() user: AuthUser,
    @FileId() id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const workspace = await this.workspaces.forUser(user.id);
    const { entry, stream } = await this.files.content(workspace.id, id);
    releaseOnClose(response, stream);
    return new StreamableFile(stream, {
      type: contentTypeFor(entry.name),
      disposition: contentDisposition(entry.name),
      length: entry.size,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @FileId() id: string): Promise<void> {
    const workspace = await this.workspaces.forUser(user.id);
    await this.files.remove(workspace.id, id);
  }
}
