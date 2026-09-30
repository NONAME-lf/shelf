'use client';

import { Button } from '@shelf/ui';
import './globals.css';

/** Replaces the root layout when it fails, so it renders its own <html> and <body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="uk">
      <body>
        <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-paper p-4 text-center">
          <h1 className="text-xl font-semibold text-ink">Щось пішло не так</h1>
          <Button variant="primary" onClick={reset}>
            Спробувати ще раз
          </Button>
        </div>
      </body>
    </html>
  );
}
