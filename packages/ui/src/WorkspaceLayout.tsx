'use client';

import type { UserDto } from '@shelf/shared';
import { Library, LogOut, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from './cn';

export type WorkspaceLayoutProps = {
  user: UserDto;
  onLogout: () => void;
  sidebar?: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
};

/**
 * Dark sidebar + content. Below 768 px (a phone, a narrow browser window) the sidebar slides in over the
 * content from a toggle in the toolbar; at 768 px and wider — the desktop window is never narrower — the
 * layout is the same as before the toggle existed.
 */
export function WorkspaceLayout({ user, onLogout, sidebar, toolbar, children }: WorkspaceLayoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="h-full md:grid md:grid-cols-[272px_1fr]">
      {open ? (
        <div
          data-testid="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink/45 md:hidden"
        />
      ) : null}
      <aside
        data-testid="sidebar"
        data-open={open}
        className={cn(
          'flex min-h-0 flex-col bg-ink text-paper',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[272px] max-md:max-w-[85vw] max-md:shadow-2xl max-md:transition-[transform,visibility]',
          !open && 'max-md:invisible max-md:-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <Library size={22} className="text-brass" />
          <span className="text-lg font-semibold tracking-tight">Shelf</span>
          <button
            type="button"
            aria-label="Закрити меню"
            onClick={() => setOpen(false)}
            className="ml-auto rounded p-1 text-paper/70 hover:bg-white/5 md:hidden"
          >
            <X size={18} />
          </button>
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
      <main className="flex min-h-0 min-w-0 flex-col max-md:h-full">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-6 py-3 max-md:px-4">
          <button
            type="button"
            data-testid="sidebar-toggle"
            aria-label="Меню"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-ink hover:bg-paper-2 md:hidden"
          >
            <Menu size={20} />
          </button>
          {toolbar}
        </div>
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
