import { ApiError } from '@shelf/shared';
import { describe, expect, it } from 'vitest';
import { apiUrlFrom, DEFAULT_API_URL } from './config';
import { clearSession, loadSession, saveSession, verifySession, type SessionStorage, type StoredSession } from './session';

class MemoryStorage implements SessionStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const LOCAL = 'http://localhost:4000';
const SESSION: StoredSession = {
  serverUrl: LOCAL,
  token: 'jwt-artem',
  user: { id: 'user-artem', email: 'artem@shelf.dev', displayName: 'Артем' },
};

describe('stored session', () => {
  it('round-trips the session of this API and forgets it on logout', () => {
    const storage = new MemoryStorage();
    expect(loadSession(storage, LOCAL)).toBeNull();
    saveSession(storage, SESSION);
    expect(loadSession(storage, LOCAL)).toEqual(SESSION);
    clearSession(storage);
    expect(loadSession(storage, LOCAL)).toBeNull();
  });

  it('ignores a session issued by another API and damaged data', () => {
    const storage = new MemoryStorage();
    saveSession(storage, SESSION);
    expect(loadSession(storage, 'https://shelf-api.onrender.com')).toBeNull();
    storage.setItem('shelf.session', '{not json');
    expect(loadSession(storage, LOCAL)).toBeNull();
    storage.setItem('shelf.session', JSON.stringify({ ...SESSION, token: '' }));
    expect(loadSession(storage, LOCAL)).toBeNull();
    storage.setItem('shelf.session', 'null');
    expect(loadSession(storage, LOCAL)).toBeNull();
  });
});

describe('verifySession', () => {
  it('drops a rejected token and keeps the session when the server is unreachable', async () => {
    const rejected = async () => {
      throw new ApiError(401, 'Сесія недійсна або завершилася');
    };
    const offline = async () => {
      throw new ApiError(0, "Сервер недоступний — перевірте з'єднання");
    };
    expect(await verifySession(SESSION, rejected)).toBeNull();
    expect(await verifySession(SESSION, offline)).toEqual(SESSION);
  });

  it('takes the current name from the server', async () => {
    const renamed = { ...SESSION.user, displayName: 'Артемій' };
    expect(await verifySession(SESSION, async () => renamed)).toEqual({ ...SESSION, user: renamed });
  });
});

describe('apiUrlFrom', () => {
  it('uses the local stack unless NEXT_PUBLIC_API_URL is set', () => {
    expect(apiUrlFrom(undefined)).toBe(DEFAULT_API_URL);
    expect(apiUrlFrom('  ')).toBe(DEFAULT_API_URL);
    expect(apiUrlFrom(' https://shelf-api.onrender.com ')).toBe('https://shelf-api.onrender.com');
  });
});
