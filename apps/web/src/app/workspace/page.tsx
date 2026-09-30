'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../../lib/SessionProvider';
import { Splash } from '../../screens/Splash';
import { WorkspaceScreen } from '../../screens/WorkspaceScreen';

export default function WorkspacePage() {
  const { ready, session, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  if (!ready || !session) return <Splash />;
  // a new account gets a fresh screen: no list, preview or sync state of the previous one survives
  return <WorkspaceScreen key={session.user.id} session={session} onLogout={signOut} />;
}
