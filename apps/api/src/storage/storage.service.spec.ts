import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import { loadConfig } from '../config/config';
import { StorageService, type S3Like } from './storage.service';

const config = loadConfig({ DATABASE_URL: 'x', JWT_SECRET: 'x', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b' });

function fakeClient(respond: (command: object) => unknown = () => ({})) {
  const sent: object[] = [];
  const client = {
    send: jest.fn(async (command: object) => {
      sent.push(command);
      return respond(command);
    }),
  } as unknown as S3Like;
  return { client, sent };
}

describe('StorageService', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('puts an object with its content type into the bucket', async () => {
    const { client, sent } = fakeClient();
    await new StorageService(config, client).put('workspaces/w/f', Buffer.from('hi'), 'text/plain; charset=utf-8');
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'shelf',
      Key: 'workspaces/w/f',
      ContentType: 'text/plain; charset=utf-8',
    });
  });

  it('returns the object body as a stream', async () => {
    const body = Readable.from(['bytes']);
    const { client, sent } = fakeClient(() => ({ Body: body }));
    await expect(new StorageService(config, client).get('k')).resolves.toBe(body);
    expect(sent[0]).toBeInstanceOf(GetObjectCommand);
  });

  it('deletes an object', async () => {
    const { client, sent } = fakeClient();
    await new StorageService(config, client).delete('k');
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input).toEqual({ Bucket: 'shelf', Key: 'k' });
  });

  it('creates the bucket on start-up when it does not exist', async () => {
    const { client, sent } = fakeClient((command) => {
      if (command instanceof HeadBucketCommand) {
        throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      }
      return {};
    });
    await new StorageService(config, client).onModuleInit();
    expect(sent.map((command) => command.constructor)).toEqual([HeadBucketCommand, CreateBucketCommand]);
  });

  it('keeps running when the bucket check fails for another reason', async () => {
    const { client, sent } = fakeClient(() => {
      throw Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } });
    });
    await expect(new StorageService(config, client).onModuleInit()).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });
});
