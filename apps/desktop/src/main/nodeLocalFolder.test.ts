import { sha256Hex } from '@shelf/shared';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeLocalFolder } from './nodeLocalFolder';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelf-folder-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('NodeLocalFolder', () => {
  it('lists regular, non-hidden files with size and modification time', async () => {
    const when = new Date('2026-09-01T10:00:00.000Z');
    await writeFile(join(dir, 'Main.kt'), 'fun main() {}');
    await utimes(join(dir, 'Main.kt'), when, when);
    await writeFile(join(dir, '.DS_Store'), 'x');
    await mkdir(join(dir, 'nested'));

    expect(await new NodeLocalFolder(dir).listFiles()).toEqual([
      { name: 'Main.kt', path: join(dir, 'Main.kt'), size: 13, modifiedAt: when.getTime() },
    ]);
  });

  it('writes bytes with the given modification time and leaves no temporary file', async () => {
    const folder = new NodeLocalFolder(dir);
    const when = new Date('2026-09-02T12:30:00.000Z');
    expect(await folder.write('photo.jpg', new Uint8Array([1, 2, 3]), when)).toMatchObject({
      name: 'photo.jpg',
      size: 3,
      modifiedAt: when.getTime(),
    });
    expect(await readdir(dir)).toEqual(['photo.jpg']);
    expect([...(await folder.read('photo.jpg'))]).toEqual([1, 2, 3]);
  });

  it('computes the same checksum as the shared helper', async () => {
    await writeFile(join(dir, 'todo.txt'), 'buy milk');
    expect(await new NodeLocalFolder(dir).checksum('todo.txt')).toBe(await sha256Hex(new TextEncoder().encode('buy milk')));
  });

  it('refuses names that leave the folder', async () => {
    await expect(new NodeLocalFolder(dir).read('../secret.txt')).rejects.toThrow('secret.txt');
  });

  it('writes a file with a very long name', async () => {
    const name = `${'a'.repeat(246)}.txt`;
    await new NodeLocalFolder(dir).write(name, new Uint8Array([1]), new Date());
    expect(await readdir(dir)).toEqual([name]);
  });

  it('leaves no temporary file when the write fails', async () => {
    await mkdir(join(dir, 'taken.txt'));
    await expect(new NodeLocalFolder(dir).write('taken.txt', new Uint8Array([1]), new Date())).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['taken.txt']);
  });
});
