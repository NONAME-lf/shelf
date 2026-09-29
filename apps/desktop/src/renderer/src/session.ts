import { FileApiClient, type UserDto } from '@shelf/shared';

const KEY = 'shelf.session';

export type StoredSession = { serverUrl: string; token: string; user: UserDto };

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return parsed.serverUrl && parsed.token && parsed.user ? (parsed as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function makeApi(serverUrl: string, token: string | null, onUnauthorized?: () => void): FileApiClient {
  return new FileApiClient({ baseUrl: serverUrl, token, onUnauthorized });
}
