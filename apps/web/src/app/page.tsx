'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../lib/SessionProvider';
import { Splash } from '../screens/Splash';

/** "/" opens the workspace of a signed-in user and the login screen otherwise. */
export default function HomePage() {
  const { ready, session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready) router.replace(session ? '/workspace' : '/login');
  }, [ready, session, router]);

  return <Splash />;
}
