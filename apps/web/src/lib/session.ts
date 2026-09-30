import { ApiError, FileApiClient, type UserDto } from '@shelf/shared';
import { API_URL } from './config';

const KEY = 'shelf.session';

/** The signed-in user. `serverUrl` records which API issued the token. */
export type StoredSession = { serverUrl: string; token: string; user: UserDto };
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The stored session of this deployment's API; a session of another API or damaged data is ignored. */
export function loadSession(storage: SessionStorage, serverUrl = API_URL): StoredSession | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    const valid =
      parsed?.serverUrl === serverUrl &&
      typeof parsed.token === 'string' &&
      parsed.token.length > 0 &&
      typeof parsed.user?.id === 'string';
    return valid ? (parsed as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(storage: SessionStorage, session: StoredSession): void {
  storage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(storage: SessionStorage): void {
  storage.removeItem(KEY);
}

export function makeApi(token: string | null, onUnauthorized?: () => void): FileApiClient {
  return new FileApiClient({ baseUrl: API_URL, token, onUnauthorized });
}

/**
 * Checks a stored session with GET /auth/me. A token the server rejects (expired after 24 h, a reset
 * database) is dropped; an unreachable server is not a reason to log out, so the session is kept.
 */
export async function verifySession(session: StoredSession, me: () => Promise<UserDto>): Promise<StoredSession | null> {
  try {
    return { ...session, user: await me() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    return session;
  }
}
