'use client';

import { WorkspaceLayout } from '@shelf/ui';
import type { StoredSession } from '../lib/session';

type Props = { session: StoredSession; onLogout: () => void };

/** The signed-in user's space. The file list is added in the next task. */
export function WorkspaceScreen({ session, onLogout }: Props) {
  return (
    <WorkspaceLayout user={session.user} onLogout={onLogout} toolbar={null}>
      <p className="px-6 py-16 text-center text-muted">Shelf</p>
    </WorkspaceLayout>
  );
}
