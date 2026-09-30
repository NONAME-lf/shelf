'use client';

import { AuthForm, messageOf, type AuthMode, type AuthValues } from '@shelf/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { makeApi } from '../lib/session';
import { useSession } from '../lib/SessionProvider';
import { SLOW_START_HINT, SLOW_START_MS, Splash } from './Splash';

const ROUTES: Record<AuthMode, string> = { login: '/login', register: '/register' };

/**
 * /login and /register (UC1, UC2). There is no server-address field: the API address is fixed per
 * deployment by NEXT_PUBLIC_API_URL.
 */
export function LoginScreen({ mode }: { mode: AuthMode }) {
  const { ready, session, signIn } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ready && session) router.replace('/workspace');
  }, [ready, session, router]);

  // a request still pending after a few seconds usually means the free-tier server is waking up
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  // AuthForm calls `void onSubmit(values)`: every failure has to end up in the `error` prop.
  const submit = async (values: AuthValues) => {
    setBusy(true);
    setError(null);
    try {
      const api = makeApi(null);
      const response =
        mode === 'login'
          ? await api.login({ email: values.email, password: values.password })
          : await api.register({ email: values.email, password: values.password, displayName: values.displayName });
      signIn(response.accessToken, response.user);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  if (!ready || session) return <Splash />;
  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(circle_at_15%_20%,#f6e7c4,transparent_40%),radial-gradient(circle_at_85%_85%,#e2ded3,transparent_45%)] p-4">
      <div className="flex w-full flex-col items-center gap-3">
        <AuthForm mode={mode} onModeChange={(next) => router.push(ROUTES[next])} onSubmit={submit} busy={busy} error={error} />
        {busy && slow && (
          <p data-testid="login-slow" className="max-w-sm text-center text-sm text-muted">
            {SLOW_START_HINT}
          </p>
        )}
      </div>
    </div>
  );
}
