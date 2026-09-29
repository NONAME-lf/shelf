import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountKey, DEFAULT_SERVER_URL, NO_BINDING, SettingsStore } from './settings';

const ARTEM = accountKey('http://localhost:4000', 'user-artem');
const IRYNA = accountKey('http://localhost:4000', 'user-iryna');

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelf-settings-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('starts with the default server and no folder bound', () => {
    const store = new SettingsStore(join(dir, 'settings.json'));
    expect(store.serverUrl).toBe(DEFAULT_SERVER_URL);
    expect(store.binding(ARTEM)).toEqual(NO_BINDING);
  });

  it('keeps the folder and tracking of each account across instances', () => {
    const file = join(dir, 'settings.json');
    const store = new SettingsStore(file);
    store.setServerUrl('https://shelf-api.onrender.com');
    store.updateBinding(ARTEM, { folderPath: '/Users/artem/Shelf', watch: true });
    store.updateBinding(IRYNA, { folderPath: '/Users/iryna/Shelf' });

    const reopened = new SettingsStore(file);
    expect(reopened.serverUrl).toBe('https://shelf-api.onrender.com');
    expect(reopened.binding(ARTEM)).toEqual({ folderPath: '/Users/artem/Shelf', watch: true });
    expect(reopened.binding(IRYNA)).toEqual({ folderPath: '/Users/iryna/Shelf', watch: false });
  });

  it('tells accounts apart by server and user, whatever the spelling of the address', () => {
    expect(accountKey(' http://localhost:4000/', 'u1')).toBe(accountKey('http://localhost:4000/api', 'u1'));
    expect(accountKey('http://localhost:4000', 'u1')).not.toBe(accountKey('https://shelf-api.onrender.com', 'u1'));
    expect(accountKey('http://localhost:4000', 'u1')).not.toBe(accountKey('http://localhost:4000', 'u2'));
  });

  it('drops the folder saved by the single-account format, keeping the server address', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, JSON.stringify({ serverUrl: 'https://shelf-api.onrender.com', folderPath: '/Users/artem/Shelf', watch: true }));
    const store = new SettingsStore(file);
    expect(store.serverUrl).toBe('https://shelf-api.onrender.com');
    expect(store.binding(ARTEM)).toEqual(NO_BINDING);

    store.updateBinding(IRYNA, { watch: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      serverUrl: 'https://shelf-api.onrender.com',
      bindings: { [IRYNA]: { folderPath: null, watch: true } },
    });
  });

  it('falls back to the defaults for a corrupted or malformed file', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, '{ not json');
    expect(new SettingsStore(file).serverUrl).toBe(DEFAULT_SERVER_URL);
    await writeFile(file, JSON.stringify({ serverUrl: 42, bindings: { [ARTEM]: { folderPath: false, watch: 'yes' }, [IRYNA]: 7 } }));
    const store = new SettingsStore(file);
    expect(store.serverUrl).toBe(DEFAULT_SERVER_URL);
    expect(store.binding(ARTEM)).toEqual(NO_BINDING);
    expect(store.binding(IRYNA)).toEqual(NO_BINDING);
  });
});
