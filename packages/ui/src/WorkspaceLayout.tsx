'use client';

import type { UserDto } from '@shelf/shared';
import { Library, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

export type WorkspaceLayoutProps = {
  user: UserDto;
  onLogout: () => void;
  sidebar?: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
};

export function WorkspaceLayout({ user, onLogout, sidebar, toolbar, children }: WorkspaceLayoutProps) {
  return (
    <div className="grid h-full grid-cols-[272px_1fr]">
      <aside className="flex min-h-0 flex-col bg-ink text-paper">
        <div className="flex items-center gap-2 px-5 py-5">
          <Library size={22} className="text-brass" />
          <span className="text-lg font-semibold tracking-tight">Shelf</span>
        </div>
        <div className="px-5 pb-4">
          <div className="text-xs uppercase tracking-wider text-paper/50">Простір</div>
          <div className="truncate font-medium" data-testid="workspace-owner">
            {user.displayName}
          </div>
          <div className="truncate text-xs text-paper/60">{user.email}</div>
        </div>
        <div className="flex-1 space-y-4 overflow-auto px-3 pb-4">{sidebar}</div>
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onLogout}
            data-testid="logout"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-paper/80 hover:bg-white/5"
          >
            <LogOut size={16} /> Вийти
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-6 py-3">{toolbar}</div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}

export function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-ink-2 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-paper/60">{title}</h3>
      {children}
    </section>
  );
}
