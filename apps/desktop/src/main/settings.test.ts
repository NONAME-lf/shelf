import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore } from './settings';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shelf-settings-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('starts with the defaults', () => {
    expect(new SettingsStore(join(dir, 'settings.json')).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists changes across instances', () => {
    const file = join(dir, 'settings.json');
    new SettingsStore(file).update({ serverUrl: 'https://shelf-api.onrender.com', folderPath: '/Users/artem/Shelf', watch: true });
    expect(new SettingsStore(file).get()).toEqual({
      serverUrl: 'https://shelf-api.onrender.com',
      folderPath: '/Users/artem/Shelf',
      watch: true,
    });
  });

  it('falls back to the defaults for a corrupted or malformed file', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, '{ not json');
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
    await writeFile(file, JSON.stringify({ serverUrl: 42, folderPath: false, watch: 'yes' }));
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });
});
