import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { releaseOnClose } from './files.controller';

const slowStream = () => new Readable({ read() {} });

describe('releaseOnClose', () => {
  it('destroys the storage stream when the client disconnects before the end', () => {
    const response = new EventEmitter();
    const stream = slowStream();
    releaseOnClose(response as unknown as Response, stream);

    response.emit('close');

    expect(stream.destroyed).toBe(true);
  });

  it('leaves a fully read stream alone', async () => {
    const response = new EventEmitter();
    const stream = Readable.from(['done']);
    releaseOnClose(response as unknown as Response, stream);
    stream.resume();
    await new Promise((resolve) => stream.once('end', resolve));
    const destroy = jest.spyOn(stream, 'destroy');

    response.emit('close');

    expect(destroy).not.toHaveBeenCalled();
  });

  it('does nothing before the response closes', () => {
    const response = new EventEmitter();
    const stream = slowStream();
    releaseOnClose(response as unknown as Response, stream);

    expect(stream.destroyed).toBe(false);
  });
});
