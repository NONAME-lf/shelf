import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DesktopSettings } from '../shared/ipc';

export const DEFAULT_SETTINGS: DesktopSettings = { serverUrl: 'http://localhost:4000', folderPath: null, watch: false };

/** userData/settings.json: server address, bound folder, automatic tracking (spec §5.1, §7.4). */
export class SettingsStore {
  private current: DesktopSettings;

  constructor(private readonly file: string) {
    this.current = this.read();
  }

  get(): DesktopSettings {
    return { ...this.current };
  }

  update(patch: Partial<DesktopSettings>): DesktopSettings {
    this.current = { ...this.current, ...patch };
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.current, null, 2));
    renameSync(temp, this.file);
    return this.get();
  }

  private read(): DesktopSettings {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Record<keyof DesktopSettings, unknown>>;
      return {
        serverUrl:
          typeof parsed.serverUrl === 'string' && parsed.serverUrl.trim() ? parsed.serverUrl : DEFAULT_SETTINGS.serverUrl,
        folderPath: typeof parsed.folderPath === 'string' ? parsed.folderPath : null,
        watch: parsed.watch === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
