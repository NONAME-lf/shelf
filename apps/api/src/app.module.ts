import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [ConfigModule, PrismaModule, StorageModule, UsersModule, AuthModule, WorkspaceModule, FilesModule],
  controllers: [HealthController],
})
export class AppModule {}
