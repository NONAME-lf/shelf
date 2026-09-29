import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
};

/** A native <dialog>: Escape and a click on the backdrop close it. */
export function Modal({ open, title, onClose, children, footer, wide, testId }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'm-auto rounded-xl border border-line bg-white p-0 text-ink shadow-2xl',
        wide ? 'w-[min(960px,92vw)]' : 'w-[min(560px,92vw)]',
      )}
    >
      {open ? (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <button type="button" aria-label="Закрити" onClick={onClose} className="rounded p-1 text-muted hover:bg-paper-2">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
