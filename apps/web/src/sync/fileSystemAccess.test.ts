import { describe, expect, it } from 'vitest';
import { asDirectoryHandle, FakeClock, FakeDirectoryHandle } from '../test/fakeFileSystem';
import { directoryPicker, hasFolderPermission } from './fileSystemAccess';

describe('directoryPicker', () => {
  it('is null without the File System Access API (Firefox, Safari)', () => {
    expect(directoryPicker({})).toBeNull();
    expect(directoryPicker({ showDirectoryPicker: undefined })).toBeNull();
  });

  it('calls showDirectoryPicker on its window with the options', async () => {
    const calls: unknown[] = [];
    const scope = {
      showDirectoryPicker(this: unknown, options: unknown) {
        calls.push([this, options]);
        return Promise.resolve('handle');
      },
    };
    const picker = directoryPicker(scope);
    expect(await picker?.({ id: 'shelf-sync', mode: 'readwrite' })).toBe('handle');
    expect(calls).toEqual([[scope, { id: 'shelf-sync', mode: 'readwrite' }]]);
  });
});

describe('hasFolderPermission', () => {
  it('asks only when told to and reports the answer', async () => {
    const folder = new FakeDirectoryHandle('Shelf', new FakeClock());
    expect(await hasFolderPermission(asDirectoryHandle(folder), false)).toBe(true);

    folder.permission = 'prompt';
    expect(await hasFolderPermission(asDirectoryHandle(folder), false)).toBe(false);
    expect(folder.permissionRequests).toBe(0);

    folder.grantOnRequest = false;
    expect(await hasFolderPermission(asDirectoryHandle(folder), true)).toBe(false);
    folder.grantOnRequest = true;
    expect(await hasFolderPermission(asDirectoryHandle(folder), true)).toBe(true);
    expect(folder.permissionRequests).toBe(2);
  });
});
