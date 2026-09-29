import { ApiError } from '@shelf/shared';
import { useCallback, useEffect, useState } from 'react';
import type { DesktopSettings } from '../../shared/ipc';
import { LoginScreen } from './screens/LoginScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import { clearSession, loadSession, makeApi, saveSession, syncSessionOf, type StoredSession } from './session';

const FALLBACK_SETTINGS: DesktopSettings = { serverUrl: 'http://localhost:4000', folderPath: null, watch: false };

export function App() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await window.shelf.getSettings());
      } catch {
        setSettings(FALLBACK_SETTINGS);
      }
      const stored = loadSession();
      if (stored) {
        try {
          try {
            await makeApi(stored.serverUrl, stored.token).me();
          } catch (error) {
            // an unreachable server is not a reason to log out: only a rejected token is
            if (error instanceof ApiError && error.status === 401) throw error;
          }
          setSettings(await window.shelf.setSession(syncSessionOf(stored)));
          setSession(stored);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) clearSession();
          // any other failure (IPC included) leaves the login screen
        }
      }
      setReady(true);
    })();
  }, []);

  // the folder and tracking shown in the sidebar belong to the account that is signed in
  const logout = useCallback(async () => {
    clearSession();
    setSettings(await window.shelf.setSession(null));
    setSession(null);
  }, []);

  const loggedIn = useCallback(async (next: StoredSession) => {
    setSettings(await window.shelf.setSession(syncSessionOf(next)));
    saveSession(next);
    setSession(next);
  }, []);

  if (!ready || !settings) {
    return <div className="flex h-full items-center justify-center text-muted">Shelf…</div>;
  }
  if (!session) return <LoginScreen settings={settings} onSettings={setSettings} onLoggedIn={loggedIn} />;
  return <WorkspaceScreen session={session} settings={settings} onSettings={setSettings} onLogout={logout} />;
}
