'use client';

import { useEffect, useState } from 'react';

/** How long the wait may last before it is explained: a free-tier server needs up to a minute to wake up. */
export const SLOW_START_MS = 5000;

/** Shown until the stored session has been read and checked in the browser, and during redirects. */
export function Splash() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-muted">
      <div>Shelf…</div>
      {slow && (
        <p data-testid="splash-slow" className="max-w-sm text-sm">
          Сервер прокидається після простою — це може тривати до хвилини
        </p>
      )}
    </div>
  );
}
