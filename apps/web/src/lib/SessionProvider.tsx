'use client';

import type { UserDto } from '@shelf/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_URL } from './config';
import { clearSession, loadSession, makeApi, saveSession, verifySession, type StoredSession } from './session';

type SessionContextValue = {
  /** false until the stored session has been read and checked in the browser */
  ready: boolean;
  session: StoredSession | null;
  signIn: (token: string, user: UserDto) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** The session (token + user) in localStorage, as in the desktop renderer, shared by every route. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let active = true;
    const stored = loadSession(localStorage);
    if (!stored) {
      setReady(true);
      return;
    }
    void verifySession(stored, () => makeApi(stored.token).me()).then((checked) => {
      if (!active) return;
      if (checked) saveSession(localStorage, checked);
      else clearSession(localStorage);
      setSession(checked);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback((token: string, user: UserDto) => {
    const next: StoredSession = { serverUrl: API_URL, token, user };
    saveSession(localStorage, next);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession(localStorage);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ ready, session, signIn, signOut }), [ready, session, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
