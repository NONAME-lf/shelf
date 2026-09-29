import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({ imports: [StorageModule, WorkspaceModule], controllers: [FilesController], providers: [FilesService] })
export class FilesModule {}
