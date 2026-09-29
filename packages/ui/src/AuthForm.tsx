import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';

export type AuthMode = 'login' | 'register';
export type AuthValues = { email: string; password: string; displayName: string };

export type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (values: AuthValues) => Promise<void> | void;
  busy?: boolean;
  error?: string | null;
  /** Shown only by clients that can talk to any server (the desktop client). */
  serverUrl?: string;
  onServerUrlChange?: (url: string) => void;
};

const inputClass =
  'h-10 w-full rounded-md border border-line bg-paper px-3 text-sm outline-none focus:border-brass focus:ring-2 focus:ring-brass-soft';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function AuthForm({ mode, onModeChange, onSubmit, busy, error, serverUrl, onServerUrlChange }: AuthFormProps) {
  const [values, setValues] = useState<AuthValues>({ email: '', password: '', displayName: '' });
  const isRegister = mode === 'register';
  const set = (key: keyof AuthValues) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-8 shadow-sm">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Shelf</div>
        <p className="mt-1 text-sm text-muted">
          {isRegister ? 'Створіть обліковий запис, щоб отримати власний простір.' : 'Увійдіть до свого простору з файлами.'}
        </p>
      </div>

      {onServerUrlChange ? (
        <Field label="Адреса сервера">
          <input
            data-testid="auth-server"
            className={inputClass}
            value={serverUrl ?? ''}
            onChange={(event) => onServerUrlChange(event.target.value)}
            placeholder="http://localhost:4000"
            required
          />
        </Field>
      ) : null}

      {isRegister ? (
        <Field label="Ім'я">
          <input
            data-testid="auth-name"
            className={inputClass}
            value={values.displayName}
            onChange={(event) => set('displayName')(event.target.value)}
            maxLength={60}
            required
          />
        </Field>
      ) : null}

      <Field label="Email">
        <input
          data-testid="auth-email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={values.email}
          onChange={(event) => set('email')(event.target.value)}
          required
        />
      </Field>

      <Field label="Пароль">
        <input
          data-testid="auth-password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className={inputClass}
          value={values.password}
          onChange={(event) => set('password')(event.target.value)}
          minLength={isRegister ? 8 : 1}
          required
        />
      </Field>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full" disabled={busy} data-testid="auth-submit">
        {isRegister ? 'Зареєструватися' : 'Увійти'}
      </Button>
      <button
        type="button"
        data-testid="auth-toggle"
        className="w-full text-sm text-brass-2 hover:underline"
        onClick={() => onModeChange(isRegister ? 'login' : 'register')}
      >
        {isRegister ? 'Вже маєте обліковий запис? Увійти' : 'Немає облікового запису? Зареєструватися'}
      </button>
    </form>
  );
}
