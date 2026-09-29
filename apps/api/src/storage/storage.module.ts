import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { S3_CLIENT, StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new S3Client({
          endpoint: config.s3.endpoint,
          region: config.s3.region,
          forcePathStyle: config.s3.forcePathStyle,
          credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
          // Checksums only when the operation requires them: MinIO and Supabase Storage reject some defaults.
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
