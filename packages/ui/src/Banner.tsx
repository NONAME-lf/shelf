import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Banner({ tone = 'info', children, onClose }: { tone?: 'info' | 'error'; children: ReactNode; onClose?: () => void }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid="notice"
      className={cn(
        'mx-6 mt-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm',
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-brass-soft text-ink',
      )}
    >
      <span className="flex-1">{children}</span>
      {onClose ? (
        <button type="button" aria-label="Закрити" onClick={onClose} className="opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}
