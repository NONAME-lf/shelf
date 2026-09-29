import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { APP_CONFIG, type AppConfig } from '../config/config';

export const S3_CLIENT = Symbol('S3_CLIENT');
export type S3Like = { send: S3Client['send'] };

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate?.$metadata?.httpStatusCode === 404 || candidate?.name === 'NotFound' || candidate?.name === 'NoSuchBucket';
}

/** File bytes in an S3-compatible store (MinIO locally, Supabase Storage in production). */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(S3_CLIENT) private readonly client: S3Like,
  ) {
    this.bucket = config.s3.bucket;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (isNotFound(error)) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket "${this.bucket}"`);
        return;
      }
      this.logger.warn(`Cannot check bucket "${this.bucket}": ${(error as Error).message}`);
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return response.Body as unknown as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
