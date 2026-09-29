import { normalizeBaseUrl } from '@shelf/shared';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The local folder one account synchronizes with, and whether changes in it are tracked automatically. */
export type FolderBinding = { folderPath: string | null; watch: boolean };
/** The contents of userData/settings.json. */
export type StoredSettings = { serverUrl: string; bindings: Record<string, FolderBinding> };

export const DEFAULT_SERVER_URL = 'http://localhost:4000';
export const NO_BINDING: FolderBinding = { folderPath: null, watch: false };

/** An account is a user on a server: "<user id>@http://localhost:4000/api". */
export function accountKey(serverUrl: string, userId: string): string {
  return `${userId}@${normalizeBaseUrl(serverUrl)}`;
}

function parseBindings(value: unknown): Record<string, FolderBinding> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([account, binding]: [string, unknown]) => {
      if (!binding || typeof binding !== 'object') return [];
      const { folderPath, watch } = binding as Partial<Record<keyof FolderBinding, unknown>>;
      return [[account, { folderPath: typeof folderPath === 'string' ? folderPath : null, watch: watch === true }]];
    }),
  );
}

/**
 * userData/settings.json (spec §5.1, §7.4): the server address offered at login and, for each account,
 * the bound folder and automatic tracking — the next user who signs in never inherits them.
 */
export class SettingsStore {
  private current: StoredSettings;

  constructor(private readonly file: string) {
    this.current = this.read();
  }

  get serverUrl(): string {
    return this.current.serverUrl;
  }

  setServerUrl(serverUrl: string): void {
    this.save({ ...this.current, serverUrl });
  }

  binding(account: string): FolderBinding {
    return Object.hasOwn(this.current.bindings, account) ? { ...this.current.bindings[account] } : { ...NO_BINDING };
  }

  updateBinding(account: string, patch: Partial<FolderBinding>): FolderBinding {
    const next = { ...this.binding(account), ...patch };
    this.save({ ...this.current, bindings: { ...this.current.bindings, [account]: next } });
    return { ...next };
  }

  private save(next: StoredSettings): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, this.file);
    this.current = next;
  }

  private read(): StoredSettings {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { serverUrl?: unknown; bindings?: unknown };
      return {
        serverUrl: typeof parsed.serverUrl === 'string' && parsed.serverUrl.trim() ? parsed.serverUrl : DEFAULT_SERVER_URL,
        // the single-account format kept one folder for whoever signed in: it is dropped, not guessed
        bindings: parseBindings(parsed.bindings),
      };
    } catch {
      return { serverUrl: DEFAULT_SERVER_URL, bindings: {} };
    }
  }
}
