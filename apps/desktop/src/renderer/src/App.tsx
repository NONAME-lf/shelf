import { ApiError } from '@shelf/shared';
import { useCallback, useEffect, useState } from 'react';
import type { DesktopSettings } from '../../shared/ipc';
import { LoginScreen } from './screens/LoginScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import { clearSession, loadSession, makeApi, saveSession, type StoredSession } from './session';

export function App() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      setSettings(await window.shelf.getSettings());
      const stored = loadSession();
      if (stored) {
        try {
          await makeApi(stored.serverUrl, stored.token).me();
          await window.shelf.setSession({ serverUrl: stored.serverUrl, token: stored.token });
          setSession(stored);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) clearSession();
          else {
            await window.shelf.setSession({ serverUrl: stored.serverUrl, token: stored.token });
            setSession(stored);
          }
        }
      }
      setReady(true);
    })();
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    await window.shelf.setSession(null);
    setSession(null);
  }, []);

  const loggedIn = useCallback(async (next: StoredSession) => {
    saveSession(next);
    await window.shelf.setSession({ serverUrl: next.serverUrl, token: next.token });
    setSession(next);
  }, []);

  if (!ready || !settings) {
    return <div className="flex h-full items-center justify-center text-muted">Shelf…</div>;
  }
  if (!session) return <LoginScreen settings={settings} onSettings={setSettings} onLoggedIn={loggedIn} />;
  return <WorkspaceScreen session={session} settings={settings} onSettings={setSettings} onLogout={logout} />;
}
