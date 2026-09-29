import { AuthForm, messageOf, type AuthMode, type AuthValues } from '@shelf/ui';
import { useState } from 'react';
import type { DesktopSettings } from '../../../shared/ipc';
import { makeApi, type StoredSession } from '../session';

type Props = {
  settings: DesktopSettings;
  onSettings: (settings: DesktopSettings) => void;
  onLoggedIn: (session: StoredSession) => Promise<void>;
};

export function LoginScreen({ settings, onSettings, onLoggedIn }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AuthForm calls `void onSubmit(values)`: every failure has to end up in the `error` prop.
  const submit = async (values: AuthValues) => {
    setBusy(true);
    setError(null);
    try {
      const api = makeApi(serverUrl, null);
      const response =
        mode === 'login'
          ? await api.login({ email: values.email, password: values.password })
          : await api.register({ email: values.email, password: values.password, displayName: values.displayName });
      onSettings(await window.shelf.setServerUrl(serverUrl));
      await onLoggedIn({ serverUrl, token: response.accessToken, user: response.user });
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_15%_20%,#f6e7c4,transparent_40%),radial-gradient(circle_at_85%_85%,#e2ded3,transparent_45%)]">
      <AuthForm
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          setError(null);
        }}
        onSubmit={submit}
        busy={busy}
        error={error}
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
      />
    </div>
  );
}
